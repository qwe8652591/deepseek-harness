# Agent Note: 面板工作台注册

Status: implemented

[English](2026-09-13-panel-workbench-registration.md) | 中文

## Problem

需求和设计工作台以文档为中心，同时复用原生 Agent Session。选择其页签必须打开文档界面，不能创建无关 Session，也不能让后台 Session 选择关闭文档。

## Decision

uiWorkspace 注册区分原生会话分组与插件自有面板。会话分组保留[基于预设的导航](2026-09-13-plugin-workbench-navigation.zh.md)。面板注册指定已有 main 插槽，不占用预设。原生 Session 列表更新时保留面板选择；显式打开 Conversation 时切换到原生 Session 所属分组。移除当前面板会显示当前 Conversation，不创建 Session。

## Alternatives considered

占位预设会错误归类文档 Session，并要求不必要的 Host 组合。在侧边栏加入需求工程专用导航会让外壳耦合单一产品。面板注册让未来的文档工作台使用同一个导航服务。

## Consequences

插件声明目标类型，并通过 effect 注册界面和清理函数。主面板键与工作台键可以不同。原生 Session 执行、存储和 Agent 预设仍由现有服务拥有；插件可以选择绑定的 Session，同时保持文档面板打开。

## Verification

Workspace 服务测试覆盖面板选择、原生更新、显式 Conversation 导航、工作台恢复、被取代的创建操作及当前面板清理。本地期望快照同时记录面板与运行中 Session 的选中状态。需求工程插件的浏览器构建冒烟验证其在实际 Web profile 中的注册。
