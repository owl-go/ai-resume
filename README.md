# 简历专家

简历专家是一个本地运行的 AI 简历优化工具。可以直接优化简历，也可以上传目标岗位描述，做匹配诊断、补充经历并准备面试。

## 启动

需要 Node.js 22 或更新版本。

```sh
npm ci
npm start
```

打开 [本地简历专家](http://localhost:4174/)，在「设置」中填写支持 Chat Completions 和 JSON 输出的模型地址、模型名与 API Key。也可以将 `.env.example` 复制为 `.env.local` 并填写配置。用「测试连接」验证模型，再上传 PDF 或 Word (.docx) 简历开始。

最新简历稿和版式会自动保存在当前浏览器。同一浏览器再次打开同一地址时，可以直接继续优化。可从「会话说明」清除本地保存。PDF 导出使用本机中文字体，必要时可通过环境变量 `RESUME_PDF_FONT` 指定字体文件。

## 开发

```sh
npm test
```

页面文件直接维护在 `dist/`。模型提示词位于 `prompts/resume/`。完整功能和验收规则见 [产品需求与构建提示词](docs/resume-expert-prd.md)，变更记录见 [简历专家实现记录](docs/resume-expert.md)。
