import { useEffect, useRef, useCallback } from "react";
import type { TextareaHTMLAttributes } from "react";

/**
 * AutoTextarea — a self-growing textarea that expands vertically as the user types.
 * Accepts an optional `maxRows` prop: once the content exceeds that height,
 * the textarea stops growing and shows a vertical scrollbar instead.
 * Drop-in replacement for <textarea>. Accepts all standard textarea props.
 */
type AutoTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
    minRows?: number;
    maxRows?: number;
};

// ~21px per line of text + 20px vertical padding (py-2.5)
const LINE_H = 21;
const PAD    = 20;

export default function AutoTextarea({ minRows = 2, maxRows, style, onChange, ...props }: AutoTextareaProps) {
    const ref = useRef<HTMLTextAreaElement>(null);

    const resize = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        // Collapse to 0 so scrollHeight reflects true content size
        el.style.height = "0px";
        el.style.overflowY = "hidden";
        const scrollH = el.scrollHeight;
        const maxH    = maxRows ? maxRows * LINE_H + PAD : undefined;
        if (maxH && scrollH > maxH) {
            el.style.height    = `${maxH}px`;
            el.style.overflowY = "auto";
        } else {
            el.style.height = `${scrollH}px`;
        }
    }, [maxRows]);

    // Resize whenever controlled value changes or on mount
    useEffect(() => { resize(); }, [props.value, resize]);

    // Re-adjust on window resize (responsive layouts)
    useEffect(() => {
        window.addEventListener("resize", resize);
        return () => window.removeEventListener("resize", resize);
    }, [resize]);

    const minHeight = minRows * LINE_H + PAD;
    const maxHeight = maxRows ? maxRows * LINE_H + PAD : undefined;

    return (
        <textarea
            ref={ref}
            rows={minRows}
            {...props}
            style={{ minHeight, maxHeight, resize: "none", overflow: "hidden", ...style }}
            onChange={(e) => {
                resize();
                onChange?.(e);
            }}
        />
    );
}
