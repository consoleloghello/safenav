# 题库导航 · 危化品安全生产复习站

把多个题库整合到一个 GitHub Pages 站点里，**一个导航页 + 一个通用查看器 + 每套题一个数据文件**。

## 在线访问

启用 GitHub Pages 后访问：

```
https://<你的用户名>.github.io/<仓库名>/
```

## 站点结构

```
.
├── index.html              导航页：自动列出所有题库，点卡片进入
├── viewer.html             通用查看器：viewer.html?p=<题库id>
├── assets/
│   ├── style.css           全站共用样式（深色/浅色、卡片、高亮、响应式、打印）
│   └── viewer.js           查看器逻辑（渲染、搜索、高亮、主题）
├── data/                   构建产物，勿手改
│   ├── manifest.js         题库清单（导航页读取）
│   └── <id>.js             每套题库的数据
├── sources/                数据源，改这里
│   ├── papers.json         题库元数据清单
│   └── *.json              后台导出的原始 data.json
├── tools/build.ts          构建脚本
└── deno.json               任务定义
```

**为什么这么设计**：样式和逻辑只有一份，改一次全站生效；每套题库只是一个纯数据文件，
所以新增题库不需要动任何 HTML/CSS/JS。

## 功能

- **导航页**：卡片式列出所有题库，显示题数、题型构成、数据批次，点击进入
- **查看器**：答案直接显示，正确选项绿色高亮 ✓，多选答案形如 `ABCDE（多选）`，判断题选项渲染为 `√ / ×`
- **搜索**：匹配题干 / 选项 / 解析，命中词实时高亮（大小写不敏感），并显示命中题数
- **深色模式**：默认深色，可切换浅色，选择被 localStorage 记住
- **响应式**：手机 / 平板 / 桌面自适应
- **打印友好**：`Cmd+P` 可直接打印成纸质复习材料
- **纯静态零依赖**：不请求任何外部资源，离线可用，双击 `index.html` 也能跑

## 新增一套题库（三步）

1. 把后台导出的 `data.json` 放进 `sources/`，改成有意义的名字，例如 `sources/foo.json`
2. 编辑 `sources/papers.json`，在 `papers` 数组里加一条：

   ```json
   {
     "id": "foo",
     "source": "foo.json",
     "title": "题库标题",
     "sub": "一句话说明",
     "tags": ["分类"],
     "order": 4
   }
   ```

3. 运行构建：

   ```bash
   deno task build
   ```

构建脚本会自动：
- 把 `\uXXXX` 转义还原成中文
- 拆出题干 / 选项（`~~!!~~` 分隔）/ 答案 / 解析
- **校验数据**（ID 重复、题干为空、答案超出选项范围、判断题选项数不对等），有问题会直接报错并中止
- 生成 `data/<id>.js` 与更新后的 `data/manifest.js`

提交推送后，导航页会自动多出一个按钮，**不需要改任何 HTML**。

## 本地预览

```bash
# 方式一：直接双击 index.html（无需服务器）
open index.html

# 方式二：起一个本地服务器（推荐，和线上环境一致）
deno task serve
```

## 部署到 GitHub Pages

```bash
git init
git add -A
git commit -m "init: 题库导航站点"
git branch -M main
git remote add origin <仓库地址>
git push -u origin main
```

推送后在仓库 **Settings → Pages** 中设置：

- **Source**: `Deploy from a branch`
- **Branch**: `main` / `/ (root)`

约 1 分钟后即可访问 `https://<用户名>.github.io/<仓库名>/`。

## 数据字段说明

`sources/*.json` 为后台原始导出格式，构建脚本读取以下字段：

| 原始字段 | 含义 | 产物字段 |
| --- | --- | --- |
| `ID` | 题目 ID | `id` |
| `tq_name` | 题干 | `q` |
| `TQ_TYPE` | 题型：`1` 单选、`2` 多选、`3` 判断 | `type` |
| `xx` | 选项，`~~!!~~` 分隔 | `opts` |
| `BZ_ANSWER` | 答案（多选形如 `A,B,C,D,E`；判断为 `对` / `错`） | `ans` |
| `analysis` | 解析，为空则不显示解析区块 | `exp` |
| `batch` | 数据批次 | `batch` |

## 当前题库

| 题库 | 题数 |
| --- | --- |
| 化工和危险化学品生产经营企业重大生产安全事故隐患判定准则（全题库） | 126 |
| 重大生产安全事故隐患判定准则 · 考试版 | 55 |
| 危险化学品应急处置与应急管理 | 40 |
| **合计** | **221** |
