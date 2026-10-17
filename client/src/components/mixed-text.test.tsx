import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import * as React from "react"
import { MixedText } from "./mixed-text"

/**
 * Seam: mixed-direction question rendering.
 *  - Persian prose keeps dir="auto" (RTL),
 *  - ``` fenced blocks render as LTR <pre>,
 *  - `inline code` renders as an isolated LTR <code>.
 */

afterEach(cleanup)

describe("MixedText", () => {
  it("renders plain Persian text with dir=auto", () => {
    render(<MixedText text="دو عدد به‌صورت رشته در اختیار داریم." />)
    const node = screen.getByText("دو عدد به‌صورت رشته در اختیار داریم.")
    expect(node.closest("[dir='auto']")).not.toBeNull()
    expect(document.querySelector("pre")).toBeNull()
    expect(document.querySelector("code")).toBeNull()
  })

  it("renders fenced blocks as LTR pre, prose stays RTL", () => {
    render(
      <MixedText
        text={'خروجی چیست؟\n```\nx = "10"\nprint(x)\n```\nتمام شد.'}
      />,
    )

    const pre = document.querySelector("pre")
    expect(pre).not.toBeNull()
    expect(pre).toHaveAttribute("dir", "ltr")
    expect(pre?.textContent).toContain('x = "10"')

    // prose around the block is still there with auto direction
    expect(screen.getByText("خروجی چیست؟")).not.toBeNull()
    expect(screen.getByText("تمام شد.")).not.toBeNull()
  })

  it("renders inline code as isolated LTR code", () => {
    render(<MixedText text="تابع `print(x)` را صدا بزن." />)

    const code = document.querySelector("code")
    expect(code).not.toBeNull()
    expect(code).toHaveAttribute("dir", "ltr")
    expect(code?.textContent).toBe("print(x)")
  })

  it("treats a trailing unclosed fence as a code block", () => {
    render(<MixedText text={'متن سوال\n```\nprint(1)'} />)

    const pre = document.querySelector("pre")
    expect(pre).not.toBeNull()
    expect(pre?.textContent).toContain("print(1)")
  })

  it("never injects markup from question text", () => {
    render(<MixedText text={'<img src=x onerror=alert(1)>'} />)
    expect(document.querySelector("img")).toBeNull()
    expect(screen.getByText("<img src=x onerror=alert(1)>")).not.toBeNull()
  })
})
