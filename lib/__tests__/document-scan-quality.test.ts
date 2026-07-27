import { describe, expect, it } from "vitest"

import {
  assessScanQuality,
  computeGlareRatio,
  computeLaplacianVariance,
  cropBoxForAspectRatio,
} from "@/lib/document-scan-quality"

describe("computeLaplacianVariance", () => {
  it("returns a high variance for a sharp, high-contrast image", () => {
    // 5x5 checkerboard — strong edges everywhere.
    const width = 5
    const height = 5
    const luminance: number[] = []
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        luminance.push((x + y) % 2 === 0 ? 255 : 0)
      }
    }
    expect(computeLaplacianVariance(luminance, width, height)).toBeGreaterThan(1000)
  })

  it("returns zero for a flat, uniform image", () => {
    const width = 5
    const height = 5
    const luminance = new Array(width * height).fill(120)
    expect(computeLaplacianVariance(luminance, width, height)).toBe(0)
  })

  it("returns zero for an image too small to have an interior", () => {
    expect(computeLaplacianVariance([1, 2, 3, 4], 2, 2)).toBe(0)
  })
})

describe("computeGlareRatio", () => {
  it("returns the fraction of blown-out pixels", () => {
    const luminance = [255, 255, 100, 100, 100] // 2 of 5 at/above default threshold
    expect(computeGlareRatio(luminance)).toBeCloseTo(0.4)
  })

  it("returns zero given no bright pixels", () => {
    expect(computeGlareRatio([100, 110, 90])).toBe(0)
  })

  it("returns zero given an empty array", () => {
    expect(computeGlareRatio([])).toBe(0)
  })
})

describe("assessScanQuality", () => {
  it("flags both warnings for a flat, overexposed image", () => {
    const width = 5
    const height = 5
    const luminance = new Array(width * height).fill(250)
    const result = assessScanQuality(luminance, width, height)
    expect(result.blurWarning).toBe(true)
    expect(result.glareWarning).toBe(true)
  })

  it("flags neither warning for a sharp, well-exposed image", () => {
    const width = 5
    const height = 5
    const luminance: number[] = []
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        luminance.push((x + y) % 2 === 0 ? 200 : 60)
      }
    }
    const result = assessScanQuality(luminance, width, height)
    expect(result.blurWarning).toBe(false)
    expect(result.glareWarning).toBe(false)
  })
})

describe("cropBoxForAspectRatio", () => {
  it("crops the sides of an image wider than the target ratio", () => {
    const box = cropBoxForAspectRatio(1000, 1000, 2)
    expect(box).toEqual({ x: 0, y: 250, width: 1000, height: 500 })
  })

  it("crops the top/bottom of an image taller than the target ratio", () => {
    const box = cropBoxForAspectRatio(500, 1000, 2)
    expect(box).toEqual({ x: 0, y: 375, width: 500, height: 250 })
  })

  it("produces a box matching the ID card ratio within rounding", () => {
    const box = cropBoxForAspectRatio(1000, 1000)
    expect(box.width / box.height).toBeCloseTo(1.586, 1)
  })
})
