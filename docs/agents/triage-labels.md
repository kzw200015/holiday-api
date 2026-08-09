# 分诊标签

技能以五个标准分诊角色表述状态。本文件把这些角色映射到本仓库问题追踪中实际使用的标签字符串。

| mattpocock/skills 中的标签 | 本仓库使用的标签  | 含义                     |
| -------------------------- | ----------------- | ------------------------ |
| `needs-triage`             | `needs-triage`    | 维护者需要评估该问题     |
| `needs-info`               | `needs-info`      | 等待提出者补充信息       |
| `ready-for-agent`          | `ready-for-agent` | 规格完整，可交给离线代理 |
| `ready-for-human`          | `ready-for-human` | 需要人工实现             |
| `wontfix`                  | `wontfix`         | 不会处理                 |

技能提到某个角色时（例如「打上可交给代理的分诊标签」），使用表中对应的标签字符串。

本仓库采用本地 Markdown 追踪，标签写在工单文件的 `Status:` 行。若实际词汇有变，修改右侧一列即可。
