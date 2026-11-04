import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Logo do Hora H (marca "HORA" + símbolo redondo). O texto usa a cor do contexto (`currentColor`): branco sobre
 * faixa escura e preto sobre fundo claro; o símbolo é sempre laranja, com o H branco e o ponto verde.
 * Arquivos de origem em `public/logo/` (marca-claro.svg e marca-escuro.svg têm o mesmo desenho).
 */
@Component({
  selector: 'hh-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'img', 'aria-label': 'Hora H', style: 'display:inline-flex;flex:none' },
  template: `
    <svg [style.height.px]="altura()" style="width:auto;display:block" viewBox="40 48 314 64" aria-hidden="true" focusable="false"><g fill="currentColor"><rect x="40" y="52" width="16" height="56"></rect><rect x="76" y="52" width="16" height="56"></rect><rect x="40" y="73" width="52" height="14"></rect></g><g transform="translate(104 52)"><circle cx="28" cy="28" r="22" fill="none" stroke="currentColor" stroke-width="12"></circle><rect x="25" y="13" width="6" height="17" rx="3" fill="currentColor"></rect><rect x="25" y="25" width="6" height="14" rx="3" fill="currentColor" transform="rotate(-62 28 28)"></rect></g><g fill="currentColor"><rect x="172" y="52" width="16" height="56"></rect><path d="M180 59.5H194A10.5 10.5 0 0 1 194 80.5H180" fill="none" stroke="currentColor" stroke-width="15"></path><polygon points="186,84 202,84 214,108 197,108"></polygon><path fill-rule="evenodd" d="M220 108L238 52H256L274 108H257L253.5 97H240.5L237 108ZM243.5 87H250.5L247 75Z"></path></g><g transform="translate(290 48) scale(0.5333333333333333)"><circle cx="60" cy="60" r="56" fill="#E84A27"></circle><rect x="32" y="30" width="14" height="60" rx="7" fill="#fff"></rect><rect x="74" y="30" width="14" height="60" rx="7" fill="#fff"></rect><rect x="36" y="53" width="48" height="14" rx="7" fill="#fff" transform="rotate(-24 60 60)"></rect><circle cx="60" cy="60" r="6" fill="#65A30D"></circle></g></svg>
  `,
})
export class LogoComponent {
  /** Altura em pixels; a largura acompanha (proporção 314:64). */
  readonly altura = input(28);
}
