// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { BID_ONTOLOGY } from '../src/definition.ts'
import { BidStudio } from '../src/client/BidStudio.tsx'
import { en, zh } from '../src/client/locales.ts'

afterEach(cleanup)

describe('Bid Studio ontology inspector', () => {
  it('exposes object, relationship, Function, Action, and workflow definitions', () => {
    render(<BidStudio
      definition={BID_ONTOLOGY}
      remote={{ listObjects: vi.fn(async () => []), execute: vi.fn() }}
      close={vi.fn()}
      t={makeTranslate(zh, commonZh)}
      useSessions={() => { throw new Error('unused') }}
      useWorkspaces={() => { throw new Error('unused') }}
      usePanelInfo={() => { throw new Error('unused') }}
      useSessionPendingInteraction={() => { throw new Error('unused') }}
      useResource={() => { throw new Error('unused') }}
    />)

    fireEvent.click(screen.getByText('查看完整标书本体定义（13 个对象类型、12 个关系、3 个 Function、11 个 Action）'))
    const inspector = screen.getByRole('group', { name: '标书本体定义' })
    expect(within(inspector).getByRole('button', { name: '对象类型 13' })).toBeDefined()
    fireEvent.click(within(inspector).getByRole('button', { name: '关系定义 12' }))
    expect(within(inspector).getAllByText('包含文件')).toHaveLength(2)
    expect(within(inspector).getByText('一对多')).toBeDefined()

    fireEvent.click(within(inspector).getByRole('button', { name: 'Function 定义 3' }))
    fireEvent.click(within(inspector).getByRole('button', { name: /计算证据覆盖率/ }))
    expect(within(inspector).getAllByText('计算证据覆盖率')).toHaveLength(2)
    expect(within(inspector).getByText('number')).toBeDefined()

    fireEvent.click(within(inspector).getByRole('button', { name: 'Action 定义 11' }))
    expect(within(inspector).getAllByText('新建投标项目')).toHaveLength(2)
    expect(within(inspector).getByText('机器驱动')).toBeDefined()

    fireEvent.click(within(inspector).getByRole('button', { name: '运行流程 8' }))
    expect(within(inspector).getByText('标准投标应答流程')).toBeDefined()
    expect(within(inspector).getAllByText('导入招标文件')).toHaveLength(2)
  })

  it('localizes interface controls while preserving ontology labels', () => {
    render(<BidStudio
      definition={BID_ONTOLOGY}
      remote={{ listObjects: vi.fn(async () => []), execute: vi.fn() }}
      close={vi.fn()}
      t={makeTranslate(en, commonZh)}
      useSessions={() => { throw new Error('unused') }}
      useWorkspaces={() => { throw new Error('unused') }}
      usePanelInfo={() => { throw new Error('unused') }}
      useSessionPendingInteraction={() => { throw new Error('unused') }}
      useResource={() => { throw new Error('unused') }}
    />)
    expect(screen.getByRole('heading', { name: 'Bid Studio' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Run to human review' })).toBeDefined()
    fireEvent.click(screen.getByText('Bid ontology (13 object types, 12 relationships, 3 Functions, 11 Actions)'))
    expect(screen.getByRole('button', { name: 'Relationships 12' })).toBeDefined()
    expect(screen.getAllByText('投标项目').length).toBeGreaterThan(0)
  })
})
