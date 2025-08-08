# Week1 Divergent Pilot 全链路测试指南

## 🎯 测试目标

验证Week1实现的**动态发散-汇聚（"总分总"）**pilot系统的核心功能，确保整个架构正常工作。

## 📋 功能概述

### 已实现的核心功能

1. **DivergentSession创建** - 支持发散模式的pilot会话
2. **LLM驱动的任务生成** - 智能分解用户需求为并行子任务  
3. **并行任务执行** - 同时执行多个子任务（Week1使用mock执行）
4. **结果汇聚** - 智能汇总并行任务结果
5. **完成度评估** - 评估当前阶段完成度，决定下一步行动
6. **API接口** - 完整的REST API支持前端调用

### 技术架构

- **DivergentEngine**: LLM驱动的核心算法引擎
- **DivergentOrchestrator**: 主控制器，管理整个"总分总"循环
- **PilotDivergentService**: 会话管理服务
- **API Controller**: RESTful接口层
- **数据库扩展**: 支持发散模式的数据模型

## 🚀 环境准备

### 1. 启动后端API服务

```bash
cd /Users/qiyuan/Documents/Code/anthhub/ai/refly-team/refly-origin/apps/api

# 构建并启动API服务器
npm run build:fast && node dist/main.js

# 验证服务器启动
curl http://localhost:5800/health  # 可能404，正常
```

### 2. 用户认证设置

```bash
# 创建测试用户并获取cookie
curl -X POST http://localhost:5800/v1/auth/email/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword"
  }'

# 登录获取认证cookie
curl -X POST http://localhost:5800/v1/auth/email/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "test@example.com",
    "password": "testpassword"
  }'
```

## 🧪 核心功能测试

### Test Case 1: 创建发散会话

**测试目标**: 验证发散会话创建功能

```bash
curl -X POST http://localhost:5800/v1/pilot/divergent/session/new \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "mode": "divergent",
    "prompt": "帮我分析人工智能的发展趋势",
    "maxDivergence": 4,
    "maxDepth": 3
  }'
```

**预期响应**:
```json
{
  "success": true,
  "data": {
    "sessionId": "ps-xxxxxxxxxxxx",
    "status": "init",
    "mode": "divergent"
  }
}
```

**预期数据库记录**:
- `PilotSession` 表新增1条记录
- `mode` = "divergent"
- `maxDivergence` = 4
- `maxDepth` = 3
- `currentDepth` = 0
- `input` = JSON字符串包含用户prompt

### Test Case 2: 查询会话状态

**测试目标**: 验证会话状态查询和进度跟踪

```bash
# 使用上一步返回的sessionId
curl -X GET "http://localhost:5800/v1/pilot/divergent/session/status?sessionId=ps-xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -b cookies.txt
```

**预期响应**:
```json
{
  "success": true,
  "data": {
    "sessionId": "ps-xxxxxxxxxxxx",
    "status": "executing|completed",
    "mode": "divergent",
    "currentDepth": 0-3,
    "maxDepth": 3,
    "maxDivergence": 4,
    "progress": {
      "totalSteps": 0,
      "executionSteps": 0,
      "summarySteps": 0,
      "completedSteps": 0
    },
    "title": "帮我分析人工智能的发展趋势",
    "createdAt": "2024-08-08T...",
    "updatedAt": "2024-08-08T..."
  }
}
```

**预期数据库变化**:
- 系统自动在后台执行发散-汇聚流程
- `PilotStep` 表会新增多条记录：
  - 执行步骤（nodeType="execution"）
  - 汇聚步骤（nodeType="summary"）
- `status` 字段变化：init → executing → completed

### Test Case 3: 会话列表查询

**测试目标**: 验证用户会话列表功能

```bash
curl -X GET "http://localhost:5800/v1/pilot/divergent/sessions?limit=5" \
  -H "Content-Type: application/json" \
  -b cookies.txt
```

**预期响应**:
```json
{
  "success": true,
  "data": [
    {
      "sessionId": "ps-xxxxxxxxxxxx",
      "title": "帮我分析人工智能的发展趋势",
      "status": "completed",
      "mode": "divergent",
      "currentDepth": 1-3,
      "maxDepth": 3,
      "stepCount": 0,
      "createdAt": "2024-08-08T...",
      "updatedAt": "2024-08-08T..."
    }
  ]
}
```

## 📊 数据库验证

### 检查PilotSession表

```sql
-- 查看发散会话记录
SELECT 
  sessionId,
  mode,
  maxDivergence,
  maxDepth,
  currentDepth,
  title,
  status,
  createdAt
FROM PilotSession 
WHERE mode = 'divergent' 
ORDER BY createdAt DESC 
LIMIT 5;
```

### 检查PilotStep表

```sql
-- 查看步骤执行记录
SELECT 
  stepId,
  sessionId,
  name,
  skillName,
  nodeType,
  depth,
  status,
  createdAt
FROM PilotStep 
WHERE sessionId = 'ps-xxxxxxxxxxxx'
ORDER BY createdAt ASC;
```

**预期步骤类型**:
- `nodeType = "execution"`: 并行执行的子任务
- `nodeType = "summary"`: 汇聚总结步骤
- `skillName`: webSearch, commonQnA, librarySearch等
- `depth`: 0-3，表示发散深度

## 🎯 核心逻辑验证点

### 1. LLM驱动的任务生成
- ✅ 系统能够根据用户prompt智能生成多个并行子任务
- ✅ 任务数量不超过maxDivergence限制
- ✅ 每个任务有明确的技能类型和参数

### 2. 并行执行机制
- ✅ 多个子任务同时执行（Week1使用mock结果）
- ✅ 系统能够处理部分任务失败的情况
- ✅ 所有任务完成后触发汇聚

### 3. 智能汇聚
- ✅ 系统能够将多个任务结果智能汇总
- ✅ 生成有意义的阶段性总结
- ✅ 评估当前完成度

### 4. 完成度评估
- ✅ 系统能够判断是否需要进一步发散
- ✅ 达到90%完成度时生成最终输出
- ✅ 达到最大深度时强制输出

### 5. 数据一致性
- ✅ 会话状态正确更新
- ✅ 步骤记录完整保存
- ✅ 深度和层级关系正确

## 🔍 高级测试场景

### 场景1: 多轮发散测试

```bash
# 创建需要多轮发散的复杂任务
curl -X POST http://localhost:5800/v1/pilot/divergent/session/new \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "mode": "divergent",
    "prompt": "为一家初创公司制定完整的AI产品战略，包括市场分析、技术选型、商业模式和实施路线图",
    "maxDivergence": 6,
    "maxDepth": 4
  }'
```

**预期结果**: 系统进行3-4轮发散-汇聚，生成详细的战略分析

### 场景2: 参数边界测试

```bash
# 测试最小参数
curl -X POST http://localhost:5800/v1/pilot/divergent/session/new \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "mode": "divergent",
    "prompt": "简单问题测试",
    "maxDivergence": 1,
    "maxDepth": 1
  }'
```

**预期结果**: 系统快速完成，只进行1轮发散

### 场景3: 并发测试

```bash
# 同时创建多个会话
for i in {1..3}; do
  curl -X POST http://localhost:5800/v1/pilot/divergent/session/new \
    -H "Content-Type: application/json" \
    -b cookies.txt \
    -d "{
      \"mode\": \"divergent\",
      \"prompt\": \"测试会话 $i\",
      \"maxDivergence\": 3,
      \"maxDepth\": 2
    }" &
done
wait
```

**预期结果**: 所有会话都能正常创建和执行

## 📋 验收标准

### ✅ 基础功能 (必须通过)

- [ ] API服务器正常启动，端口5800可访问
- [ ] 用户认证流程正常
- [ ] 发散会话创建成功，返回正确的sessionId
- [ ] 会话状态查询返回完整信息
- [ ] 会话列表查询正常
- [ ] 数据库中正确保存会话和步骤记录

### ✅ 核心逻辑 (必须通过)

- [ ] LLM能够根据用户prompt生成合理的子任务
- [ ] 系统按照"总分总"模式执行
- [ ] 汇聚步骤能够产生有意义的总结
- [ ] 完成度评估机制正常工作
- [ ] 最终输出正确生成

### ✅ 错误处理 (必须通过)

- [ ] 无效sessionId查询返回适当错误
- [ ] 认证失败时返回401错误
- [ ] 参数验证正确工作

### ✅ 性能指标 (应该通过)

- [ ] 单个会话创建响应时间 < 2秒
- [ ] 状态查询响应时间 < 500ms
- [ ] 并发3个会话无异常

## 🚨 已知限制 (Week1)

1. **技能执行**: 当前使用mock结果，Week2将集成真实技能服务
2. **Canvas集成**: 前端可视化未在Week1实现
3. **性能优化**: 未进行性能调优
4. **错误恢复**: 基础错误处理，无重试机制

## 🔧 故障排除

### 常见问题

1. **API服务器启动失败**
   - 检查端口5800是否被占用
   - 确认环境变量正确设置
   - 查看服务器日志

2. **认证失败**
   - 确认用户已正确创建
   - 检查cookies.txt文件生成
   - 验证cookie在请求中正确传递

3. **会话创建失败**
   - 检查请求JSON格式
   - 确认必需字段都已提供
   - 查看API服务器错误日志

4. **数据库连接问题**
   - 确认.env文件中数据库配置正确
   - 检查数据库服务状态
   - 验证Prisma迁移已执行

### 调试命令

```bash
# 查看API服务器日志
tail -f /path/to/api/logs

# 检查端口占用
lsof -i :5800

# 验证数据库连接
cd apps/api && npx prisma db pull

# 运行单元测试
npm test -- --testPathPattern=divergent
```

## 📈 测试报告模板

```markdown
## Week1 测试报告

**测试时间**: 2024-08-08
**测试人员**: [姓名]
**测试环境**: [开发/测试]

### 测试结果概览
- ✅ 基础功能: [通过数]/[总数]
- ✅ 核心逻辑: [通过数]/[总数]  
- ✅ 错误处理: [通过数]/[总数]
- ✅ 性能指标: [通过数]/[总数]

### 详细测试记录
1. **会话创建测试**: ✅/❌ [备注]
2. **状态查询测试**: ✅/❌ [备注]
3. **列表查询测试**: ✅/❌ [备注]
...

### 发现的问题
1. [问题描述] - [严重程度] - [状态]

### 建议
1. [改进建议]

### 总体评价
Week1的发散pilot系统[达到/未达到]预期功能要求...
```

---

**🎉 完成Week1全链路测试后，系统将具备完整的动态发散-汇聚能力，为Week2的前端集成和真实技能执行奠定坚实基础！**
