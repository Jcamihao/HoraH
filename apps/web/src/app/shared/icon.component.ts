import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconeNome =
  | 'home' | 'users' | 'tag' | 'sliders' | 'plus' | 'check' | 'arrow-left' | 'arrow-right'
  | 'copy' | 'alert' | 'logout' | 'x' | 'clock' | 'link' | 'chevron-left' | 'chevron-right' | 'calendar' | 'person' | 'whatsapp';

/** Ícones desenhados à mão: traço 2.25, pontas redondas, mesma grade de 24. */
@Component({
  selector: 'hh-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', style: 'display:inline-flex;flex:none' },
  template: `
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
      @switch (nome()) {
        @case ('home') { <path d="M3.5 11 12 4l8.5 7" /><path d="M6 9.5V20h12V9.5" /> }
        @case ('users') { <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.4 3.2-5 6.5-5s5.9 1.6 6.5 5" /><path d="M16 4.7a3.5 3.5 0 0 1 0 6.6" /><path d="M18 15.3c1.9.6 3.1 2.1 3.5 4.7" /> }
        @case ('tag') { <path d="M3.5 12.5V4.5h8l9 9-8 8z" /><circle cx="8" cy="9" r="1.2" fill="currentColor" stroke="none" /> }
        @case ('sliders') { <path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /> }
        @case ('plus') { <path d="M12 5v14M5 12h14" /> }
        @case ('check') { <path d="m5 12.5 4.5 4.5L19 7.5" /> }
        @case ('arrow-left') { <path d="M19 12H5M11 6l-6 6 6 6" /> }
        @case ('arrow-right') { <path d="M5 12h14M13 6l6 6-6 6" /> }
        @case ('copy') { <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" /> }
        @case ('alert') { <path d="M12 8v5" /><circle cx="12" cy="16.5" r=".6" fill="currentColor" /><path d="M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /> }
        @case ('logout') { <path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10" /><path d="M16 8l4 4-4 4M20 12H9" /> }
        @case ('x') { <path d="m6 6 12 12M18 6 6 18" /> }
        @case ('clock') { <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /> }
        @case ('chevron-left') { <path d="m15 5-7 7 7 7" /> }
        @case ('chevron-right') { <path d="m9 5 7 7-7 7" /> }
        @case ('whatsapp') { <path d="M4 20l1.2-4.1A8 8 0 1 1 8.2 19z" /><path d="M9.5 8.8c.3 2.6 2.6 4.9 5.2 5.2l1-1.2-1.9-1-.8.7c-.9-.3-1.7-1.1-2-2l.7-.8-1-1.9z" /> }
        @case ('calendar') { <rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /> }
        @case ('person') { <circle cx="12" cy="8" r="3.8" /><path d="M4.5 20c.8-3.6 3.6-5.5 7.5-5.5s6.7 1.9 7.5 5.5" /> }
        @case ('link') { <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /> }
      }
    </svg>
  `,
})
export class IconComponent {
  readonly nome = input.required<IconeNome>();
}
