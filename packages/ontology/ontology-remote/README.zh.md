# @deepseek-ai/dsh-ontology-remote

[English](README.md) | 中文

用于本体定义、对象与关系读取、Function 执行和 Action 分发的类型化浏览器 Remote。它是 `ctx.ontology` 的 Consumer；浏览器业务插件依赖该传输投影，而不直接绑定本地或平台 Provider。

## 模型体验

### 浏览器本体 Remote

#### 模型看到什么

不会直接看到。`ctx.ontologyRemote` 服务浏览器插件，而不是模型请求。

#### Token 影响

没有直接影响。

#### KV Cache 影响

在模型 Consumer 投影本体数据之前彼此独立。

## 已知限制与后续工作

- **返回对象的 Action** —— 第一版 Remote 投影返回本体对象的 Action；更广泛的工作流结果需要显式的 wire 结果联合类型。
- **尚无订阅流** —— Demo 工作台在变更后主动刷新；多窗口实时更新仍待实现。
