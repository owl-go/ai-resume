输出完整结果。字段结构中的数组可包含多项，具体数量遵循以下要求。score 为 0–100 的数字。questions 为 5–10 项，interview.questions 恰好 10 项。

按 JD 解析、诊断、匹配、追问、策略、对照、简历、面试、补强顺序组织字段。jd.competencies 恰好 5 项。diagnosis.dimensions 恰好 10 项，每项 explanation 说明扣分依据。strength 仅使用 强/中/弱/无。supplement 使用 是/否。strategy 包含六项策略，strengthening 包含五项补强建议。interview.questions 每项包含 evidence 和 advice。

resume 所有字段使用字符串，以换行组织内容。additional 无内容时为空字符串。缺失指标或证据时给出「【填写示例：具体句式和示例数据；请替换为真实数据】」，非数值证据结尾用「请按实际情况填写」，不要只写待补充。未核实的已有陈述保留【待确认】。未回答追问时，在 risk 标注需要用户确认；示例数字不是匹配或评分证据。按目标篇幅控制内容，实际页数取决于排版。

最终简历在个人信息后展示求职意向与教育背景。用户明确提供期望薪资时，放在 resume.intent 的独立一行，格式为「期望薪资：原有期望」，避免重复。没有明确期望薪资时省略。resume.projects 中每个项目以项目名开头，项目间使用一个空行，项目内使用单换行。

resume.experience 中每段任职以公司、职位和任职时间开头，任职之间使用一个空行，同段任职内使用单换行。
