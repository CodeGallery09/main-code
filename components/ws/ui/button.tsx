import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/ws/utils";

/**
 * Button — shadcn pattern, workspace sizes.
 *
 * `danger` is a neutral frame with a red glyph: a destructive action differs
 * from edit/copy by icon shape as well as colour, so colour never carries the
 * meaning alone. Icon-only buttons (size "icon" | "icon-sm") MUST be given an
 * aria-label.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-[7px] whitespace-nowrap font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border border-input bg-card text-foreground hover:bg-accent",
        ghost: "text-body hover:bg-accent",
        dashed: "border border-dashed border-input bg-transparent text-body hover:bg-card",
        danger: "border border-input bg-card text-destructive hover:bg-destructive-bg",
        warning: "border border-warning-border bg-card text-warning hover:bg-warning-bg",
        inverse: "bg-card text-foreground hover:bg-card/90",
      },
      size: {
        sm: "h-[26px] rounded-md px-[9px] text-[11.5px] [&_svg]:size-[12px]",
        md: "h-[30px] rounded-lg px-[11px] text-[12px] [&_svg]:size-[14px]",
        lg: "h-[34px] rounded-lg px-[13px] text-[12px] [&_svg]:size-[14px]",
        icon: "size-[26px] rounded-md [&_svg]:size-[13px]",
        "icon-sm": "size-[24px] rounded-md [&_svg]:size-[12px]",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});

export { buttonVariants };
