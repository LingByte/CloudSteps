import { describe, expect, it } from 'vitest'
import { parseApiJson } from './json-snowflake'

describe('parseApiJson', () => {
  it('preserves snowflake id precision as string', () => {
    // Keep digits in a string literal — Number() already loses precision.
    const raw =
      '{"code":200,"data":{"list":[{"id":1454224691240108544,"title":"测试"}]}}'
    const payload = parseApiJson<{
      data: { list: Array<{ id: string; title: string }> }
    }>(raw)
    expect(payload.data.list[0].id).toBe('1454224691240108544')
  })

  it('preserves snowflake ids inside sessionIds arrays', () => {
    const raw =
      '{"data":{"sessionIds":[1640459405329695233,1640459405329695234],"wordBookId":1640459405329695235}}'
    const payload = parseApiJson<{
      data: { sessionIds: string[]; wordBookId: string }
    }>(raw)
    expect(payload.data.sessionIds).toEqual([
      '1640459405329695233',
      '1640459405329695234',
    ])
    expect(payload.data.wordBookId).toBe('1640459405329695235')
  })

  it('does not double-quote already-string sessionIds', () => {
    const raw =
      '{"data":{"sessionIds":["1640459405329695232","1639428239858336256"],"wordBookId":"11"}}'
    const payload = parseApiJson<{
      data: { sessionIds: string[]; wordBookId: string }
    }>(raw)
    expect(payload.data.sessionIds).toEqual([
      '1640459405329695232',
      '1639428239858336256',
    ])
    expect(payload.data.wordBookId).toBe('11')
  })
})
