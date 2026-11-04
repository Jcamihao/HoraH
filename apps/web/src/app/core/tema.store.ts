import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

export type Tema = 'claro' | 'escuro';

const CHAVE = 'hh_tema';
const COR_DA_BARRA: Record<Tema, string> = { claro: '#111111', escuro: '#0a0908' };

/**
 * Tema do app. Na primeira visita segue o sistema; depois que a pessoa toca no botão, vale a escolha dela
 * (guardada no aparelho). O atributo data-tema no <html> liga os tokens escuros de `_tokens.scss`.
 */
@Injectable({ providedIn: 'root' })
export class TemaStore {
  private readonly doc = inject(DOCUMENT);
  private escolhido = false;

  readonly tema = signal<Tema>(this.inicial());

  constructor() {
    effect(() => this.aplicar(this.tema()));
    // Sem escolha própria, acompanha o sistema quando ele muda.
    try {
      this.doc.defaultView?.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!this.escolhido) this.tema.set(e.matches ? 'escuro' : 'claro');
      });
    } catch {
      // Navegador sem matchMedia: fica o tema atual.
    }
  }

  alternar(): void {
    const novo: Tema = this.tema() === 'escuro' ? 'claro' : 'escuro';
    this.escolhido = true;
    this.tema.set(novo);
    try {
      localStorage.setItem(CHAVE, novo);
    } catch {
      // Sem armazenamento (aba privada): vale só até fechar a página.
    }
  }

  private inicial(): Tema {
    try {
      const salvo = localStorage.getItem(CHAVE);
      if (salvo === 'claro' || salvo === 'escuro') {
        this.escolhido = true;
        return salvo;
      }
    } catch {
      // segue o sistema
    }
    return this.doc.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
  }

  private aplicar(tema: Tema): void {
    this.doc.documentElement.setAttribute('data-tema', tema);
    this.doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', COR_DA_BARRA[tema]);
  }
}
