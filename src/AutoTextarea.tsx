import { useEffect, useRef, useCallback } from "react";
import type { TextareaHTMLAttributes } from "react";

/**
 * AutoTextarea — a self-growing textarea that expands vertically as the user types.
 * No horizontal scrollbar, no vertical scrollbar. The field grows naturally with content.
 * Drop-in replacement for <textarea>. Accepts all standard textarea props.
 */
type AutoTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
    minRows?: number;
};

export default function AutoTextarea({ minRows = 2, style, onChange, ...props }: AutoTextareaProps) {
    const ref = useRef<HTMLTextAreaElement>(null);

    const resize = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        // Collapse to 0 first so scrollHeight reflects true content size
        el.style.height = "0px";
        el.style.height = `${el.scrollHeight}px`;
    }, []);

    // Resize whenever controlled value changes or on mount
    useEffect(() => {
        resize();
    }, [props.value, resize]);

    // Re-adjust on window resize (responsive layouts)
    useEffect(() => {
        window.addEventListener("resize", resize);
        return () => window.removeEventListener("resize", resize);
    }, [resize]);

    // Minimum height: minRows × ~21px/line + 16px padding (py-2)
    const minHeight = minRows * 21 + 16;

    return (
        <textarea
            ref={ref}
            rows={minRows}
            {...props}
            style={{ minHeight, resize: "none", overflow: "hidden", ...style }}
            onChange={(e) => {
                resize();
                onChange?.(e);
            }}
        />
    );
}
