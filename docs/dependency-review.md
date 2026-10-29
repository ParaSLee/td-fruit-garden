# 云端依赖核对

核对日期：2026-10-29。当前未更换云 SDK，也未修改已部署云函数的依赖锁文件。

## 当前结果

`cloudfunctions/checkin` 执行 `npm audit --omit=dev --json`，得到 6 个受影响包：5 high、1 moderate。这里是依赖树中受影响包的计数，不是 6 个独立漏洞。业务代码的 36 项测试不能证明这些依赖漏洞已消除。

| 层级 | 锁定版本 / 情况 |
| --- | --- |
| wx-server-sdk | 4.0.2，npm latest 标签仍指向此版本 |
| @cloudbase/node-sdk | 3.17.2，由微信 SDK 精确锁定 |
| axios | 0.27.2，由 node-sdk 精确锁定 |
| @cloudbase/database | 1.4.3，包含 lodash.set / lodash.unset 的审计记录 |

审计还会将底层风险传播到 `@cloudbase/database`、`@cloudbase/node-sdk` 和 `wx-server-sdk` 本身。自动建议是把微信 SDK 降到 2.5.3，属于跨主版本降级，未执行。

## 厂商升级候选

通过 npm 官方包元数据核对：node-sdk 3.18.7 仍锁定 axios 0.27.2 和 database 1.4.3；wx-server-sdk 5.0.1-beta.1 使用 node-sdk 4.2.0，该版本也仍锁定 axios 0.27.2。仅切换这些版本不能据此声称全部风险已修复。

微信 SDK [官方变更记录](https://github.com/wechat-miniprogram/wx-server-sdk/blob/master/CHANGELOG.md) 和 [官方 package.json](https://github.com/wechat-miniprogram/wx-server-sdk/blob/master/package.json) 对应上述 beta 升级路径。npm 包的 latest 标签与 GitHub master 源码版本并不相同。

## 当前代码的调用范围

以下依据本机锁定依赖源码和项目代码检查，是可达性分析，不是完整安全审计：

- lodash.set / lodash.unset 在 database SDK 的实时监听事件处理代码中使用；本项目只调用查询、文档写入和事务，没有启用数据库 `.watch()`。
- axios 在 node-sdk 的云环境元数据查询和扩展 requestClient 中被引用。项目没有向外暴露 requestClient，也不把客户端提供的 URL、HTTP 配置或数据库字段路径交给这些入口。SDK 的环境检测仍可能使用 axios，不能笼统称其完全未被使用。
- 当前照片下载先由 CloudBase 根据 fileID 获取临时 URL，再通过 SDK 的 request-core 请求；项目不接受普通 HTTP URL 作为图片凭证。
- 数据库禁止客户端直接读写，云函数从微信上下文识别身份，并使用固定字段构造文档。这些限制减少暴露面，但不等于依赖风险归零。

## 后续处置条件

当前保留已完成真实联调的锁定版本用于体验验收，依赖风险仍列为发布前待处理项。升级时应取得可用的厂商修复或明确维护的替代方案，在独立验证中覆盖身份、事务、文本和图片检查、图片上传与签名 URL，并确认云端 Node.js 运行时兼容，再更新锁文件和部署。不能只凭审计数字降低、类型检查或本机业务测试成功就替换生产依赖。
