# 简历排版资源

字体与图标由本地静态服务提供，不请求远程 CDN。仅在选中对应字体后由浏览器加载。

- `resume-icons.woff2`：Remix Icon 4.6.0 的 12 个图标子集，Apache-2.0，原许可在 RemixIcon-License.txt。来源 https://github.com/Remix-Design/RemixIcon/tree/v4.6.0/fonts 。该图标库在 Iconfont 的发布记录及作者确认：https://github.com/Remix-Design/RemixIcon/issues/33 。使用菜单、模板、字体、字号、行高、间距、颜色、重置、下拉、下载、Word、勾选图标；通过本地 iconfont 字体呈现。无需 Iconfont 账户或运行时外部服务。
- `FandolFang-Regular.otf`、`FandolKai-Regular.otf`：CTAN Fandol 0.3 原始仿宋、楷体字体，GPL + font exception，保留 Fandol-COPYING.txt 与 Fandol-README.txt。来源 https://ctan.org/pkg/fandol / https://mirrors.ctan.org/fonts/fandol/ 。原文件不修改。
- `Roboto-Regular.ttf`、`OpenSans-Regular.ttf`：Google Fonts 仓库对应可变字体默认轴（400 字重、100% 字宽）的静态实例，SIL OFL 1.1，许可分别在 Roboto-OFL.txt、OpenSans-OFL.txt。来源 https://github.com/google/fonts/tree/main/ofl/roboto 和 https://github.com/google/fonts/tree/main/ofl/opensans 。
- `Lato-Regular.ttf`：Google Fonts 原始常规字重，SIL OFL 1.1，许可在 Lato-OFL.txt，来源 https://github.com/google/fonts/tree/main/ofl/lato 。

黑体、宋体、Arial 使用系统字体。拉丁字体的中文采用黑体回退；PDF 按实际字形覆盖切换嵌入字体，避免中文缺字。Word 声明所选拉丁及东亚字体，不嵌入完整字体文件，打开设备未安装字体时由文档软件回退。系统字体缺失的 PDF 返回明确反馈。
