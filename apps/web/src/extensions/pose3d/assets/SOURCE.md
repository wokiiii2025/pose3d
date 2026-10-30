# 中性人体网格

本目录的 `human-neutral.bin` 为实际运行使用的生产资产，不是测试产物。

- 原始图形资产：MakeHuman 基础人体网格、骨架与蒙皮权重，CC0 1.0；完整许可见 `CC0-1.0.txt`。
- 来源：<https://github.com/AHEKOT/ComfyUI_VNCCS_Utils/tree/2b0f4041b368e3408cfb826f4cf09e6f8dafa164/web/pose_studio/assets>。
- 上游文件：`pose_studio_makehuman.v2.bin.gz`，SHA256 `76adfddc9a98ecd89e5b4a334911e65469fc77939e3fb0500832ab9e2a1baec9`。
- 派生方式：自写离线工具只提取中性基础拓扑、53 根骨骼和四权重蒙皮；剔除未渲染辅助顶点，统一到 1.75 米基准。未引入上游脚本、纹理、形态目标库或专属生成配方。
- 派生网格：13,886 个顶点、27,676 个三角面、53 根骨骼，674,840 字节。手指、脚趾、面部轮廓均来自实际网格，不用几何胶囊替代。

复现：在仓库根目录执行 `node src/extensions/pose3d/tools/build-human-mesh.mjs <上游数据包路径>`。工具先校验固定哈希，再解析数据；正常启动和构建不下载任何模型。

许可核对：<https://static.makehumancommunity.org/about/license.html>。

派生文件 SHA256：`1daf2492f018416249e6458de8ce43b5e26f095311bc9ee0e9502654a3624da2`。

## 136 项 VNCCS 姿势目录

成人向工程可从用户已配置的 ComfyUI 实例只读载入 136 项姿势。工程仓库只保存目录身份、中文名称和骨骼字段白名单，不复制第三方姿势 JSON 或预览图。

- `Totemistyk/General_Poses_PoseStudio`：50 项；核对提交 `23468b2be53ab91fe493754b241d27dcfeb965ed`。
- `Totemistyk/Ballet_PoseStudio`：目录中的 3 项基础舞姿；核对提交 `14d658f5891ac752126f47fabc54993a48980f23`，仓库声明 MIT。
- `MIUProject/VNCCS_PoseLibrary_Main`：16 项；核对提交 `baef0455ef9d3cc31ce3e2a407f722069355c617`。
- `MIUProject/MySuperPoseRepo`：12 项；核对提交 `75931b865e95b0ab97aaca2a3756f4d0fab83a32`。
- `local_user_poses`：上游扩展包整理的 55 项精选姿势，由使用者部署到自己的 VNCCS 本地姿势目录。

运行时通过已认证服务端代理读取 `/vnccs/pose_library/list?full=true`，仅保留与上述 136 项白名单匹配的有限骨骼旋转。缺失项明确显示实际数量；加载与应用姿势不触发图像生成，也不写远端姿势库。
