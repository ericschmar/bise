// @vitest-environment happy-dom
// The attachment list's laws (designer's composer-attachments A, ambient-lead m_22590, amb-feed m_22597).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { attachRow, type Chip } from '../message';
import { AttachList } from './AttachList';
import { chipDom } from './schema';

const quote: Chip = { kind: 'quote', n: 1, text: 'Contacte le service crédit immobilier, par le lien de contact sur cette même page.', from: 'main' };
const img: Chip = { kind: 'image', n: 2, path: '/Users/g/Desktop/logo.png', name: '[Image #2]' };
const file: Chip = { kind: 'file', n: 3, path: '/Users/g/Desktop/deck.pptx', bytes: 2_100_000 };
const paste: Chip = { kind: 'paste', n: 5, text: 'line\n'.repeat(14) };

describe('attachRow', () => {
  it('a quote: its first words and where it came from, the thread\'s name for main', () => {
    expect(attachRow(quote)).toEqual({ name: '“Contacte le service crédit immobilier, par le lien de conta…”', info: 'bise · 1 line' });
  });
  it('an image: its file name, never the [Image #n] tag; its pixels and size as its facts', () => {
    expect(attachRow(img)?.name).toBe('logo.png');
    expect(attachRow(img)?.info).toBe('');
    expect(attachRow({ ...img, w: 1200, h: 630, bytes: 84_000 })?.info).toBe('1200×630 · 84 kB');
  });
  it('a file: its name, its size and its folder under ~', () => {
    expect(attachRow(file, '/Users/g')).toEqual({ name: 'deck.pptx', info: '2.1 MB · ~/Desktop' });
  });
  it('a paste: its first words, its lines and size', () => {
    expect(attachRow(paste)?.info).toBe('14 lines · 0.1 kB');
  });
  it('an artifact has no row (a link in his words)', () => {
    expect(attachRow({ kind: 'artifact', n: 4, id: 'a', title: 't', url: 'u' })).toBeNull();
  });
});

afterEach(cleanup);

describe('AttachList', () => {
  const draw = (lit: number | null = null) => {
    const on = { lit: vi.fn(), remove: vi.fn(), open: vi.fn() };
    const v = render(<AttachList chips={[quote, img, file, paste]} lit={lit} onLit={on.lit} onRemove={on.remove} onOpen={on.open} home="/Users/g" testId="composer" />);
    return { v, on };
  };
  it("each row carries its chip's own number, never its place (5 after 3: 4 was removed)", () => {
    const { v } = draw();
    expect([...v.container.querySelectorAll('.b-attach-row .n')].map((e) => e.textContent)).toEqual(['1', '2', '3', '5']);
  });
  it('a hover lights it, ✕ removes that chip, a click opens it', () => {
    const { v, on } = draw(3);
    expect(v.getByTestId('composer.attach.3').classList.contains('lit')).toBe(true);
    fireEvent.mouseEnter(v.getByTestId('composer.attach.2'));
    expect(on.lit).toHaveBeenCalledWith(2);
    fireEvent.click(v.getByTestId('composer.attach.5.remove'));
    expect(on.remove).toHaveBeenCalledWith(5);
    expect(on.open).not.toHaveBeenCalled();
    fireEvent.click(v.getByTestId('composer.attach.1'));
    expect(on.open).toHaveBeenCalledWith(quote);
  });
  it('no chips, no list', () => {
    const v = render(<AttachList chips={[]} lit={null} onLit={vi.fn()} onRemove={vi.fn()} onOpen={vi.fn()} home="" testId="composer" />);
    expect(v.queryByTestId('composer.attach')).toBeNull();
  });
});

describe('the chips in the text', () => {
  it("say their number: '❝ 1', the image's thumb slot and 2, '▯ 3'", () => {
    expect(chipDom(quote).textContent).toBe('❝ 1');
    expect(chipDom(img).textContent.endsWith('2')).toBe(true);
    expect(chipDom(file).textContent).toBe('▯3');
    expect(chipDom(file).dataset.n).toBe('3');
  });
});
