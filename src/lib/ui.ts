// Classes repetidas entre a barra e o painel de configurações.

export const actionButton =
  'inline-flex items-center justify-center gap-1.5 h-7 min-w-7.5 rounded-[7px] px-[9px] text-[14px] text-muted [transition:background-color_140ms_ease-out,color_140ms_ease-out,scale_400ms_var(--spring)] hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent active:scale-[0.94] active:bg-border active:text-text active:duration-50 data-open:bg-border data-open:text-text motion-reduce:active:scale-100'

export const tooltip =
  'm-0 flex origin-(--transform-origin) items-center gap-2 rounded-[7px] border border-hairline bg-surface px-2 py-[5px] text-[12px] text-text shadow-tip [transition:opacity_120ms_ease-out,scale_200ms_var(--spring-soft)] data-ending-style:scale-[0.96] data-ending-style:opacity-0 data-instant:transition-none data-starting-style:scale-[0.96] data-starting-style:opacity-0'

export const tooltipKbd = 'font-mono text-[11px] text-muted'

export const menuContent =
  'm-0 flex min-w-56 origin-(--transform-origin) flex-col rounded-[10px] border border-hairline bg-material-thick p-1 text-[13px] text-text shadow-pop backdrop-blur-[28px] backdrop-saturate-180 [transition:opacity_120ms_ease-out,scale_160ms_var(--spring-soft)] outline-none data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0 reduced-transparency:bg-surface reduced-transparency:backdrop-blur-none motion-reduce:scale-100'

export const menuItem =
  'flex cursor-default items-center gap-3 rounded-md px-2.5 py-[5px] outline-none select-none data-destructive:text-claude data-disabled:opacity-50 data-highlighted:bg-surface-hover [&_[data-slot=menu-shortcut]]:ml-auto [&_[data-slot=menu-shortcut]]:pl-6 [&_[data-slot=menu-shortcut]]:font-mono [&_[data-slot=menu-shortcut]]:text-[11px] [&_[data-slot=menu-shortcut]]:text-muted'

export const menuSeparator = 'mx-1 my-1 h-px bg-hairline'
