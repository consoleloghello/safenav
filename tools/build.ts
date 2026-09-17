/**
 * 题库构建脚本
 * ---------------------------------------------------------------
 * 输入：sources/papers.json（题库清单）+ sources/*.json（导出的原始数据）
 * 输出：data/<id>.js（每个题库一个数据文件）+ data/manifest.js（导航页清单）
 *
 * 运行：deno task build
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

interface PaperMeta {
  id: string;
  source: string;
  title: string;
  sub?: string;
  tags?: string[];
  order?: number;
}

interface PaperEntry {
  id: string;
  source: string;
  title: string;
  sub?: string;
  tags?: string[];
  questions: {
    id: string;
    type: string;
    q: string;
    opts: string[];
    ans: string;
    exp: string;
  }[];
  batch?: string;
}

const decoder = new TextDecoder();

/** 把 \uXXXX 转义还原成真实字符 */
function unescapeUnicode(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function convert(raw: RawQuestion[]): PaperEntry["questions"] {
  return raw.map((r) => ({
    id: String(r.ID),
    type: String(r.TQ_TYPE),
    q: String(r.tq_name ?? "").trim(),
    opts: String(r.xx ?? "").split("~~!!~~").map((o) => o.trim()).filter((o) => o !== ""),
    ans: String(r.BZ_ANSWER ?? "").trim(),
    exp: String(r.analysis ?? "").trim(),
  }));
}

/** 简单校验，防止导入错误的数据 */
function validate(paper: PaperMeta, qs: PaperEntry["questions"]) {
  const problems: string[] = [];
  if (!qs.length) problems.push("题库为空");
  const ids = new Set<string>();
  qs.forEach((q, i) => {
    const at = `第 ${i + 1} 题(ID ${q.id})`;
    if (ids.has(q.id)) problems.push(`${at}：ID 重复`);
    ids.add(q.id);
    if (!q.q) problems.push(`${at}：题干为空`);
    if (!["1", "2", "3"].includes(q.type)) problems.push(`${at}：未知题型 ${q.type}`);
    if (!q.opts.length) problems.push(`${at}：没有选项`);
    if (!q.ans) problems.push(`${at}：没有答案`);
    if (q.type === "3" && q.opts.length !== 2) problems.push(`${at}：判断题应有 2 个选项`);
    if (q.type === "1" && q.ans.replace(/[^A-Za-z]/g, "").length !== 1) {
      problems.push(`${at}：单选题答案应为单个字母，实际 "${q.ans}"`);
    }
    // 答案字母不能超出选项范围
    const letters = q.ans.toUpperCase().replace(/[^A-Z]/g, "");
    if (letters && q.type !== "3") {
      for (const ch of letters) {
        const idx = ch.charCodeAt(0) - 65;
        if (idx < 0 || idx >= q.opts.length) {
          problems.push(`${at}：答案 "${q.ans}" 超出选项范围（共 ${q.opts.length} 项）`);
        }
      }
    }
  });
  if (problems.length) {
    console.error(`\n❌ 题库「${paper.id}」校验失败：`);
    problems.slice(0, 20).forEach((p) => console.error("   • " + p));
    if (problems.length > 20) console.error(`   … 另有 ${problems.length - 20} 个问题`);
    Deno.exit(1);
  }
}

async function main() {
  const meta = JSON.parse(
    unescapeUnicode(await Deno.readTextFile(`${SRC_DIR}/papers.json`)),
  ) as { papers: PaperMeta[] };

  const manifest: {
    id: string;
    title: string;
    sub?: string;
    tags?: string[];
    total: number;
    byType: Record<string, number>;
    batch?: string;
  }[] = [];

  const list = [...meta.papers].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

  for (const paper of list) {
    const text = await Deno.readTextFile(`${SRC_DIR}/${paper.source}`);
    const json = JSON.parse(unescapeUnicode(text)) as { data: RawQuestion[] };
    if (!Array.isArray(json.data)) {
      console.error(`❌ ${paper.source} 里没有 data 数组，请确认导出格式`);
      Deno.exit(1);
    }
    const questions = convert(json.data);
    validate(paper, questions);

    const byType: Record<string, number> = { "1": 0, "2": 0, "3": 0 };
    questions.forEach((q) => { byType[q.type] = (byType[q.type] ?? 0) + 1; });

    // 取出现次数最多的批次号作为题库批次
    const batches = json.data.map((r) => String(r.batch ?? "")).filter(Boolean);
    const batch = batches.length
      ? batches.sort((a, b) =>
        batches.filter((x) => x === b).length - batches.filter((x) => x === a).length
      )[0]
      : undefined;

    const payload = {
      id: paper.id,
      title: paper.title,
      sub: paper.sub ?? "",
      tags: paper.tags ?? [],
      total: questions.length,
      batch,
      questions,
    };

    await Deno.writeTextFile(
      `${OUT_DIR}/${paper.id}.js`,
      "/* 由 tools/build.ts 自动生成，请勿手动修改 —— 改数据请改 sources/ 下的源文件后重新构建 */\n" +
        "window.PAPER = " + JSON.stringify(payload) + ";\n",
    );

    manifest.push({
      id: paper.id,
      title: paper.title,
      sub: paper.sub ?? "",
      tags: paper.tags ?? [],
      total: questions.length,
      byType,
      batch,
    });

    console.log(
      `✅ ${paper.id.padEnd(22)} ${String(questions.length).padStart(3)} 题  ` +
        `(判断 ${byType["3"]} / 单选 ${byType["1"]} / 多选 ${byType["2"]})  ` +
        `批次 ${batch ?? "-"}`,
    );
  }

  await Deno.writeTextFile(
    `${OUT_DIR}/manifest.js`,
    "/* 由 tools/build.ts 自动生成，请勿手动修改 */\n" +
      "window.PAPERS = " + JSON.stringify(manifest) + ";\n",
  );

  const total = manifest.reduce((s, p) => s + p.total, 0);
  console.log(`\n📚 共 ${manifest.length} 套题库，合计 ${total} 道题`);
  console.log(`   已生成 data/manifest.js 与 ${manifest.length} 个数据文件`);
}

if (import.meta.main) await main();
