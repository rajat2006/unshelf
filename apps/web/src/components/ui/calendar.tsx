import * as React from "react";
import {
  DayButton,
  DayPicker,
  getDefaultClassNames,
  type DropdownProps,
} from "react-day-picker";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const CalendarOwnerContext = React.createContext<string | undefined>(undefined);

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames();
  const calendarOwner = React.useId();

  return (
    <CalendarOwnerContext.Provider value={calendarOwner}>
      <DayPicker
        data-calendar-owner={calendarOwner}
        showOutsideDays={showOutsideDays}
        className={cn("w-fit bg-popover p-2", className)}
        classNames={{
          root: cn("w-fit", defaults.root),
          months: cn("relative", defaults.months),
          month: cn("grid gap-2", defaults.month),
          nav: cn(
            "absolute inset-x-0 top-0 flex items-center justify-between",
            defaults.nav,
          ),
          button_previous: cn(
            buttonVariants({ variant: "quiet", size: "icon-compact" }),
            "z-10",
            defaults.button_previous,
          ),
          button_next: cn(
            buttonVariants({ variant: "quiet", size: "icon-compact" }),
            "z-10",
            defaults.button_next,
          ),
          month_caption: cn(
            "flex h-8 items-center justify-center rounded-[var(--radius-control)] bg-accent/55 px-7",
            defaults.month_caption,
          ),
          dropdowns: cn(
            "flex items-center justify-center gap-1",
            defaults.dropdowns,
          ),
          month_grid: cn(
            "w-full border-separate border-spacing-1",
            defaults.month_grid,
          ),
          weekdays: defaults.weekdays,
          weekday: cn(
            "size-7 pb-1 text-center text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground",
            defaults.weekday,
          ),
          week: defaults.week,
          day: cn("size-7 p-0 text-center", defaults.day),
          today: cn("relative", defaults.today),
          selected: cn(defaults.selected),
          outside: cn("text-muted-foreground/55", defaults.outside),
          disabled: cn(
            "pointer-events-none text-muted-foreground/35",
            defaults.disabled,
          ),
          hidden: cn("invisible", defaults.hidden),
          ...classNames,
        }}
        components={{
          Root: ({ className: rootClassName, rootRef, ...rootProps }) => (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(rootClassName)}
              {...rootProps}
            />
          ),
          Chevron: ({
            className: iconClassName,
            orientation,
            ...iconProps
          }) => {
            const Icon =
              orientation === "left"
                ? ChevronLeftIcon
                : orientation === "right"
                  ? ChevronRightIcon
                  : ChevronDownIcon;
            return (
              <Icon
                aria-hidden="true"
                className={cn("size-4", iconClassName)}
                {...iconProps}
              />
            );
          },
          DayButton: CalendarDayButton,
          MonthsDropdown: CalendarDropdown,
          YearsDropdown: CalendarDropdown,
          ...components,
        }}
        {...props}
      />
    </CalendarOwnerContext.Provider>
  );
}

function CalendarDayButton({
  className,
  day: _day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const ref = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <Button
      ref={ref}
      variant="quiet"
      size="icon-compact"
      data-selected={modifiers.selected || undefined}
      data-today={modifiers.authoritativeToday || undefined}
      data-outside={modifiers.outside || undefined}
      data-disabled={modifiers.disabled || undefined}
      className={cn(
        "relative size-7 rounded-[var(--radius-small)] border border-border/65 p-0 font-normal text-foreground shadow-[0_1px_0_color-mix(in_oklab,var(--color-border)_35%,transparent)] hover:border-primary/45 hover:bg-accent data-[disabled=true]:border-border/35 data-[disabled=true]:bg-muted/25 data-[disabled=true]:text-muted-foreground data-[outside=true]:border-border/30 data-[outside=true]:text-muted-foreground data-[selected=true]:border-primary data-[selected=true]:bg-primary/12 data-[selected=true]:font-semibold data-[today=true]:after:absolute data-[today=true]:after:bottom-0.5 data-[today=true]:after:left-1/2 data-[today=true]:after:size-1 data-[today=true]:after:-translate-x-1/2 data-[today=true]:after:rounded-full data-[today=true]:after:bg-primary focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/45 disabled:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

function CalendarDropdown({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
  disabled,
}: DropdownProps) {
  const calendarOwner = React.useContext(CalendarOwnerContext);
  const selectedValue = value === undefined ? undefined : String(value);

  return (
    <Select
      value={selectedValue}
      disabled={disabled}
      onValueChange={(nextValue) => {
        onChange?.({
          target: { value: nextValue },
        } as React.ChangeEvent<HTMLSelectElement>);
        setTimeout(() => {
          const calendar = Array.from(
            document.querySelectorAll<HTMLElement>("[data-calendar-owner]"),
          ).find((root) => root.dataset.calendarOwner === calendarOwner);
          if (!calendar) return;
          const nextTrigger = Array.from(
            calendar.querySelectorAll<HTMLButtonElement>(
              "[data-calendar-dropdown]",
            ),
          ).find((trigger) => trigger.dataset.calendarDropdown === ariaLabel);
          nextTrigger?.focus();
        }, 0);
      }}
    >
      <SelectTrigger
        data-calendar-dropdown={ariaLabel}
        aria-label={ariaLabel}
        size="sm"
        className="h-7 gap-1 border-transparent bg-transparent px-1.5 text-xs font-semibold hover:border-input"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="min-w-24">
        {options?.map((option) => (
          <SelectItem
            key={option.value}
            value={String(option.value)}
            disabled={option.disabled}
            className="min-h-8 py-1 text-xs"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export { Calendar, CalendarDayButton };
