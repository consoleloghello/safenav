/**
 * 题库构建脚本
 * ---------------------------------------------------------------
 * 用法：把后台导出的 data.json 丢进 sources/（文件名随便起，中文也行），
 *      然后运行  deno task build
 *
 * 规则：
 *   sources/隐患判定准则-全题库.json
 *        ↓
 *   data/隐患判定准则-全题库.js      ← 数据文件，文件名与源文件同名
 *   data/manifest.js                 ← 导航页清单（自动收集，不用手写）
 *
 *   文件名叫什么，导航页上的按钮就叫什么（可在 json 里加 "title" 覆盖）。
 */

const SRC_DIR = "sources";
const OUT_DIR = "data";

interface RawQuestion {
  ID: string;
  tq_name: string;
  TQ_TYPE: string;
  BZ_ANSWER: string;
  xx: string;
  analysis?: string | null;
  batch?: string | null;
}

interface Question {
  id: string;
  type: string;
  q: string;
  opts: string[];
  ans: string;
  exp: string;
}

/** 把 \uXXXX 转义还原成真实字符 */
function unescapeUnicode(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function convert(raw: RawQuestion[]): Question[] {
  return raw.map((r) => ({
    id: String(r.ID),
    type: String(r.TQ_TYPE),
    q: String(r.tq_name ?? "").trim(),
    opts: String(r.xx ?? "").split("~~!!~~").map((o) => o.trim()).filter((o) => o !== ""),
    ans: String(r.BZ_ANSWER ?? "").trim(),
    exp: String(r.analysis ?? "").trim(),
  }));
}

/** 数据校验，防止导入错误的数据 */
function validate(file: string, qs: Question[]) {
  const bad: string[] = [];
  if (!qs.length) bad.push("题库为空（data 数组长度为 0）");
  const ids = new Set<string>();
  qs.forEach((q, i) => {
    const at = `第 ${i + 1} 题(ID ${q.id})`;
    if (ids.has(q.id)) bad.push(`${at}：ID 重复`);
    ids.add(q.id);
    if (!q.q) bad.push(`${at}：题干为空`);
    if (!["1", "2", "3"].includes(q.type)) bad.push(`${at}：未知题型 "${q.type}"`);
    if (!q.opts.length) bad.push(`${at}：没有选项`);
    if (!q.ans) bad.push(`${at}：没有答案`);
    if (q.type === "3" && q.opts.length !== 2) {
      bad.push(`${at}：判断题应有 2 个选项，实际 ${q.opts.length}`);
    }
    if (q.type === "1" && q.ans.replace(/[^A-Za-z]/g, "").length !== 1) {
      bad.push(`${at}：单选题答案应为单个字母，实际 "${q.ans}"`);
    }
    const letters = q.ans.toUpperCase().replace(/[^A-Z]/g, "");
    if (letters && q.type !== "3") {
      for (const ch of letters) {
        const idx = ch.charCodeAt(0) - 65;
        if (idx < 0 || idx >= q.opts.length) {
          bad.push(`${at}：答案 "${q.ans}" 超出选项范围（共 ${q.opts.length} 项）`);
        }
      }
    }
  });
  if (bad.length) {
    console.error(`\n❌ ${file} 校验失败：`);
    bad.slice(0, 20).forEach((p) => console.error("   • " + p));
    if (bad.length > 20) console.error(`   … 另有 ${bad.length - 20} 个问题`);
    console.error("   请检查导出的数据后重新构建。\n");
    Deno.exit(1);
  }
}

/** 取出现次数最多的批次号 */
function pickBatch(raw: RawQuestion[]): string | undefined {
  const count = new Map<string, number>();
  for (const r of raw) {
    const b = String(r.batch ?? "").trim();
    if (b) count.set(b, (count.get(b) ?? 0) + 1);
  }
  let best: string | undefined, max = 0;
  for (const [b, n] of count) {
    if (n > max) {
      best = b;
      max = n;
    }
  }
  return best;
}

/**
 * 去掉文件名开头的「排序编号」作为按钮显示名（文件名本身不变，仍作为 id）
 *   01-2公司应急预案专项培训-线上考试  →  公司应急预案专项培训-线上考试
 *   02-1化工和…判定准则-模拟考        →  化工和…判定准则-模拟考
 *   隐患判定准则-全题库               →  不变（不以数字开头）
 *   2024年真题                       →  不变（4 位纯数字，不像编号）
 */
function stripOrderPrefix(base: string): string {
  const m = base.match(/^(\d+(?:[-_]\d+)*)([-_·、.\s]*)([\s\S]*)$/);
  if (!m) return base;
  const [, nums, , rest] = m;
  if (!rest) return base; // 全是编号，保留原样
  const looksLikeNumbering = /[-_]/.test(nums) || nums.length <= 3;
  if (!looksLikeNumbering) return base; // “2024年真题”这类不吃掉
  if (/^\d/.test(rest)) return base; // 编号没切干净，保守不动
  return rest;
}

async function main() {
  // 1. 收集 sources/ 下的所有 json（文件名即题库 id）
  const files: string[] = [];
  for await (const e of Deno.readDir(SRC_DIR)) {
    if (e.isFile && /\.json$/i.test(e.name)) files.push(e.name);
  }
  files.sort((a, b) => a.localeCompare(b, "zh")); // 中文按拼音排序，可加数字前缀控制顺序

  if (!files.length) {
    console.error(`❌ ${SRC_DIR}/ 里没有找到任何 .json 文件`);
    Deno.exit(1);
  }

  // 2. 先全部读取 + 校验，全部通过后才写盘（避免失败时留下半成品站点）
  const built: {
    id: string;
    title: string;
    sub: string;
    questions: Question[];
    byType: Record<string, number>;
    batch?: string;
  }[] = [];

  for (const file of files) {
    const id = file.replace(/\.json$/i, "");

    let json: Record<string, unknown>;
    try {
      json = JSON.parse(unescapeUnicode(await Deno.readTextFile(`${SRC_DIR}/${file}`)));
    } catch (err) {
      console.error(`❌ ${file} 不是合法的 JSON：${(err as Error).message}\n`);
      Deno.exit(1);
    }

    if (!Array.isArray(json.data)) {
      console.error(
        `❌ ${file} 里没有 data 数组。\n` +
          `   这个文件可能不是题库导出文件，请确认后从 sources/ 移除。\n`,
      );
      Deno.exit(1);
    }

    const raw = json.data as RawQuestion[];
    const questions = convert(raw);
    validate(file, questions); // 校验不通过会直接退出，不会写任何文件

    const byType: Record<string, number> = { "1": 0, "2": 0, "3": 0 };
    questions.forEach((q) => {
      byType[q.type] = (byType[q.type] ?? 0) + 1;
    });

    built.push({
      id,
      // 显示名：json 里的 "title" 优先，否则用文件名（自动去掉开头的排序编号）
      title: String(json.title ?? "").trim() || stripOrderPrefix(id),
      sub: String(json.sub ?? json.desc ?? "").trim(),
      questions,
      byType,
      batch: pickBatch(raw),
    });
  }

  // 3. 统一落盘：先清理旧产物（避免改名后留下垃圾文件），再写新文件
  for await (const e of Deno.readDir(OUT_DIR)) {
    if (e.isFile && /\.js$/i.test(e.name)) await Deno.remove(`${OUT_DIR}/${e.name}`);
  }

  const manifest: {
    id: string;
    title: string;
    sub: string;
    total: number;
    byType: Record<string, number>;
    batch?: string;
  }[] = [];

  for (const p of built) {
    await Deno.writeTextFile(
      `${OUT_DIR}/${p.id}.js`,
      "/* 由 tools/build.ts 自动生成，请勿手动修改 —— 改数据请改 sources/ 下的源文件后重新构建 */\n" +
        "window.PAPER = " +
        JSON.stringify({
          id: p.id,
          title: p.title,
          sub: p.sub,
          total: p.questions.length,
          batch: p.batch,
          questions: p.questions,
        }) +
        ";\n",
    );

    manifest.push({
      id: p.id,
      title: p.title,
      sub: p.sub,
      total: p.questions.length,
      byType: p.byType,
      batch: p.batch,
    });

    console.log(
      `✅ ${p.id.padEnd(26)} ${String(p.questions.length).padStart(3)} 题  ` +
        `(判断 ${p.byType["3"]} / 单选 ${p.byType["1"]} / 多选 ${p.byType["2"]})  ` +
        `批次 ${p.batch ?? "-"}`,
    );
  }

  await Deno.writeTextFile(
    `${OUT_DIR}/manifest.js`,
    "/* 由 tools/build.ts 自动生成，请勿手动修改 */\n" +
      "window.PAPERS = " + JSON.stringify(manifest) + ";\n",
  );

  const total = manifest.reduce((s, p) => s + p.total, 0);
  console.log(`\n📚 ${manifest.length} 套题库，合计 ${total} 道题 → data/manifest.js 已更新`);
}

if (import.meta.main) await main();
