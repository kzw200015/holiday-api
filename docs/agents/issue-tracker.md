# 问题追踪：本地 Markdown

本仓库的问题与规格以 Markdown 文件形式存放在 `.scratch/`。

## 约定

- 一个功能一个目录：`.scratch/<feature-slug>/`
- 规格文件为 `.scratch/<feature-slug>/spec.md`
- 实现工单一个文件一条，路径 `.scratch/<feature-slug>/issues/<NN>-<slug>.md`，编号从 `01` 起 —— 不允许把多条工单合并进单个文件
- 分诊状态记录为每个工单文件顶部附近的 `Status:` 行（角色字符串见 `triage-labels.md`）
- 评论与对话历史追加到文件底部的 `## Comments` 标题下

## 当技能说「发布到问题追踪」时

在 `.scratch/<feature-slug>/` 下新建文件（目录不存在则创建）。

## 当技能说「取出相关工单」时

读取被引用路径的文件。用户通常会直接给出路径或工单编号。

## 寻路操作

供 `/wayfinder` 使用。**地图**是一个文件，每条工单对应一个**子文件**。

- **地图**：`.scratch/<effort>/map.md` —— 承载 Notes / Decisions-so-far / Fog 正文。
- **子工单**：`.scratch/<effort>/issues/NN-<slug>.md`，编号从 `01` 起，正文写明问题。`Type:` 行记录工单类型（`research`/`prototype`/`grilling`/`task`）；`Status:` 行记录 `claimed`/`resolved`。
- **阻塞**：顶部附近的 `Blocked by: NN, NN` 行。所列文件全部 `resolved` 后该工单解除阻塞。
- **前沿**：扫描 `.scratch/<effort>/issues/`，取未关闭、未被阻塞、未被认领的文件，编号最小者优先。
- **认领**：动工前先把 `Status:` 置为 `claimed` 并保存。
- **解决**：在 `## Answer` 标题下追加答案，将 `Status:` 置为 `resolved`，再把上下文指针（要点摘要 + 链接）追加到 `map.md` 的 Decisions-so-far。
