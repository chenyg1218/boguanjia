import { describe, expect, it } from 'vitest'
import { parseGoodsIdBatch } from './goodsIds'

describe('自动弹窗 · 商品序号批量解析', () => {
  it('空输入返回空数组', () => {
    expect(parseGoodsIdBatch('')).toEqual([])
    expect(parseGoodsIdBatch('   ')).toEqual([])
  })

  it('解析单个与逗号列表', () => {
    expect(parseGoodsIdBatch('2')).toEqual([2])
    expect(parseGoodsIdBatch('1,3,5')).toEqual([1, 3, 5])
    expect(parseGoodsIdBatch('1，3、5')).toEqual([1, 3, 5])
  })

  it('解析区间与中文分隔', () => {
    expect(parseGoodsIdBatch('2-4')).toEqual([2, 3, 4])
    expect(parseGoodsIdBatch('3～5')).toEqual([3, 4, 5])
    expect(parseGoodsIdBatch('1到3')).toEqual([1, 2, 3])
    expect(parseGoodsIdBatch('5-3')).toEqual([3, 4, 5])
  })

  it('混合批量：区间 + 列表', () => {
    expect(parseGoodsIdBatch('1,3,5-8')).toEqual([1, 3, 5, 6, 7, 8])
    expect(parseGoodsIdBatch('1-100').length).toBe(100)
  })

  it('去重保序，过滤越界', () => {
    expect(parseGoodsIdBatch('2,2,3')).toEqual([2, 3])
    expect(parseGoodsIdBatch('0,1,200,201')).toEqual([1, 200])
  })

  it('忽略非法 token', () => {
    expect(parseGoodsIdBatch('abc,2,x-y')).toEqual([2])
  })
})
