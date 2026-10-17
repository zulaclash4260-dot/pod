import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * MixedText — Persian (RTL) prose mixed with code.
 *
 * Admins write questions like this:
 *
 *   دو عدد به‌صورت رشته در اختیار داریم. خروجی چیست؟
 *   ```
 *   x = "10"
 *   y = "20"
 *   print(x + y)
 *   ```
 *   و `print(int(x))` چه چاپ می‌کند؟
 *
 * Rendering rules:
 * - Plain text keeps dir="auto", so Persian stays right-aligned.
 * - ``` fenced blocks render as LTR monospace <pre>, left-aligned —
 *   the opposite direction of the surrounding text.
 * - `inline code` renders as an isolated LTR <code> span, so it never
 *   flips the bidi order of the Persian sentence around it.
 *
 * Built only from React elements (no dangerouslySetInnerHTML), so
 * question text can never inject markup.
 */

type Segment = { kind: "text"; value: string } | { kind: "code"; value: string }

function splitFenced(input: string): Segment[] {
  const fenceRe = /^```[^\S\r\n]*[^\n]*\n([\s\S]*?)^```[ \t]*$/gm
  const segments: Segment[] = []
  let last = 0
  let m: RegExpExecArray | null

  while ((m = fenceRe.exec(input)) !== null) {
    if (m.index > last) {
      segments.push({ kind: "text", value: input.slice(last, m.index) })
    }
    segments.push({ kind: "code", value: m[1].replace(/\n+$/, "") })
    last = m.index + m[0].length
  }

  const rest = input.slice(last)
  // A trailing unclosed fence (admin still typing) previews as code too.
  const unclosed = rest.match(/^```[^\S\r\n]*[^\n]*\n?([\s\S]*)$/m)

  if (unclosed && unclosed.index !== undefined) {
    const before = rest.slice(0, unclosed.index)

    if (before) {
      segments.push({ kind: "text", value: before })
    }
    segments.push({ kind: "code", value: unclosed[1].replace(/\n+$/, "") })
  } else if (rest) {
    segments.push({ kind: "text", value: rest })
  }

  return segments
}

function renderInline(value: string, keyPrefix: string): React.ReactNode {
  return value.split(/(`[^`\n]+`)/g).map((part, i) =>
    part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
      <code
        key={`${keyPrefix}c${i}`}
        dir="ltr"
        style={{ unicodeBidi: "isolate" }}
        className="mx-0.5 inline-block rounded border border-border/70 bg-secondary/70 px-1.5 py-px font-mono text-[0.85em]"
      >
        {part.slice(1, -1)}
      </code>
    ) : (
      <React.Fragment key={`${keyPrefix}t${i}`}>{part}</React.Fragment>
    ),
  )
}

export function MixedText({ text, className }: { text: string | null | undefined; className?: string }) {
  const segments = React.useMemo(() => splitFenced(text ?? ""), [text])

  return (
    <div dir="auto" className={cn("min-w-0 break-words", className)}>
      {segments.map((seg, i) =>
        seg.kind === "code" ? (
          <pre
            key={i}
            dir="ltr"
            className="my-2 overflow-x-auto rounded-lg border border-border bg-secondary/50 px-3 py-2 text-left font-mono text-[13px] leading-6 whitespace-pre"
          >
            <code>{seg.value}</code>
          </pre>
        ) : (
          <span key={i} className="whitespace-pre-wrap">
            {renderInline(seg.value, `s${i}`)}
          </span>
        ),
      )}
    </div>
  )
}
