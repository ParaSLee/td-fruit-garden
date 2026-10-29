# 猛男打卡

原生微信小程序：一个目标，一群搭子，每天一点进步。

当前为**云端体验版联调阶段**。用户已于 2026-10-29 手机试用本机版本，并授权接入云端。既有环境 `cloud1-d4g7jugs8b44f8072` 已接通，真实微信身份下的目标、带照片打卡、统计、小队创建和进度分享已经验证；第二个微信身份的加入与监督流程仍待真人联调。尚未提审或正式发布。

## 本机运行

```sh
npm ci
npm run build
```

在微信开发者工具导入仓库根目录，AppID 为 `wx0efd96316ff696fd`，后端服务选择“不使用云服务”。编译后会显示“本机体验”提示。

`miniprogram/config.local.js` 由构建脚本生成并被 Git 忽略。空 `cloudEnv` 使用本机存储；本机数据不会自动迁移到云端。开发者工具模拟器和真实手机各自保存自己的数据。菜单“工具 → 预览”可生成手机体验二维码。

## 功能

- 早睡、多喝水、锻炼三个分类，自定义具体内容，7 / 14 / 21 / 30 / 60 / 90 天周期；同时只保留一个进行中的目标。
- 每天打卡一次，可补充当日感想和最多 3 张图片；更新同一条记录不会重复计数。
- 完成率、挑战进度、连续天数、最长连续、七日表现、日历和历史目标。
- 云端小队、邀请码、进度分享卡、督促邀请和每日站内提醒。

## 验证

```sh
npm run verify
```

检查所有 JS / JSON、页面资源及共享模块同步，运行领域逻辑、并发权限和页面控制器测试。原生界面仍需在开发者工具与手机中验收；控制器测试不代替真机测试。

- [产品需求与验收](https://white-light.feishu.cn/wiki/VsJ9wdzRkiiToykCb99cYesqnt0)
- [技术设计](docs/technical.md)
- [知识库技术子文档](https://white-light.feishu.cn/docx/R92pdzeOvoyE2Ux0CyicgqUAnog)
- [交付与验证记录](docs/delivery.md)
- [云端手机与双账号验收步骤](docs/acceptance.md)
- [云端依赖核对](docs/dependency-review.md)

## 目录

| 目录 | 用途 |
| --- | --- |
| `miniprogram/` | 原生 WXML / WXSS / JS 页面与组件 |
| `shared/` | 前后端共享的领域逻辑、业务服务与本机事务存储 |
| `cloudfunctions/checkin/` | 身份校验、云数据库与内容安全适配 |
| `cloud/` | 云环境集合清单与权限规则 |
| `test/` | 业务和页面控制器测试 |

修改 `shared/` 后运行 `npm run build`，生成到两个运行包，`npm run check` 会验证副本一致。

## 云端接入

当前电脑的 `config.local.js` 已填入上述环境 ID。新检出仍默认本机模式；如需连接该环境，填写 `module.exports = { cloudEnv: 'cloud1-d4g7jugs8b44f8072' };` 并重新编译。

部署使用微信开发者工具自带 CLI，无需另装腾讯云 CLI。集合、索引、权限与函数配置见 [技术设计](docs/technical.md)，实际验证范围见 [交付记录](docs/delivery.md)。本次使用既有微信体验版环境，没有购买套餐、开启自动续费或开通新的付费日志服务。
