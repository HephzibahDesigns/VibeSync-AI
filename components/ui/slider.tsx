import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/src/lib/utils"

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  variant = "orange",
  ...props
}: SliderPrimitive.Root.Props & { variant?: "orange" | "green" }) {
  const _values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [min, max]

  const colorClass = variant === "green" ? "bg-emerald-500" : "bg-orange-500";
  const borderClass = variant === "green" ? "border-emerald-500" : "border-orange-500";
  const ringClass = variant === "green" ? "ring-emerald-500/20" : "ring-orange-500/20";

  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-horizontal:h-6 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-white/30 select-none data-horizontal:h-1.5 data-horizontal:w-full data-vertical:h-full data-vertical:w-1.5"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className={cn(colorClass, "select-none data-horizontal:h-full data-vertical:w-full")}
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className={cn(
              "relative block size-5 shrink-0 rounded-full bg-white shadow-md transition-[transform,box-shadow] select-none after:absolute after:-inset-4 hover:scale-110 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-hidden active:scale-95 disabled:pointer-events-none disabled:opacity-50 z-10"
            )}
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
