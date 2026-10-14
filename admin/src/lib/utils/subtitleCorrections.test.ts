import { describe, expect, it } from 'vitest';
import { correctSubtitleSrt } from './subtitleCorrections';
import { parseSrt } from './srt';

describe('subtitle auto correction', () => {
	it('corrects common religious names while preserving cue times and quoted lowercase usage', () => {
		const input =
			'1\n00:00:01,000 --> 00:00:03,000\njesus-christ, le christ et branam parlent de dieu.\n\n2\n00:00:03,000 --> 00:00:05,000\nLe dieu trinitaire n’est pas Dieu, ni l’antéchrist.\n';
		const result = correctSubtitleSrt(input);
		expect(result.text).toContain('Jésus-Christ, le Christ et Branham parlent de Dieu.');
		expect(result.text).toContain('Le dieu trinitaire n’est pas Dieu, ni l’antéchrist.');
		expect(parseSrt(result.text).map(({ startMs, endMs }) => [startMs, endMs])).toEqual(
			parseSrt(input).map(({ startMs, endMs }) => [startMs, endMs])
		);
		expect(correctSubtitleSrt(result.text).text).toBe(result.text);
	});

	it('uses a linked PDF to repair an aligned person name without copying unrelated wording', () => {
		const srt =
			'1\n00:00:00,000 --> 00:00:02,000\nFrère Russe a déjà trouvé les paroles justes pour nous encourager.\n';
		const pdf = 'Frère Russ a déjà trouvé les Paroles justes pour nous encourager.';
		const result = correctSubtitleSrt(srt, pdf);
		expect(result.text).toContain('Frère Russ a déjà trouvé les paroles justes');
		expect(result.changes).toContainEqual({ from: 'Russe', to: 'Russ', source: 'pdf' });
	});

	it('copies an editorial word change when exact phrases bound it in the same cue', () => {
		const srt =
			'1\n00:00:00,000 --> 00:00:02,000\nNous parlons avec le saint qui vient ce matin.\n';
		const pdf = 'Nous parlons avec le Médecin qui vient ce matin.';
		const result = correctSubtitleSrt(srt, pdf);
		expect(result.text).toContain('le Médecin qui vient');
		expect(result.changes).toContainEqual({ from: 'saint', to: 'Médecin', source: 'pdf' });
		expect(correctSubtitleSrt(result.text, pdf).text).toBe(result.text);
	});

	it('copies a short PDF insertion without changing cue timing', () => {
		const srt =
			'1\n00:00:00,000 --> 00:00:02,000\nNous avons entendu les paroles pour chacun de nous aujourd’hui.\n';
		const pdf = 'Nous avons entendu les paroles de consolation pour chacun de nous aujourd’hui.';
		const result = correctSubtitleSrt(srt, pdf);
		expect(result.text).toContain('les paroles de consolation pour chacun');
		expect(parseSrt(result.text).map(({ startMs, endMs }) => [startMs, endMs])).toEqual(
			parseSrt(srt).map(({ startMs, endMs }) => [startMs, endMs])
		);
	});

	it('does not transfer a PDF edit across subtitle cues', () => {
		const srt =
			'1\n00:00:00,000 --> 00:00:02,000\nNous avons entendu les paroles\n\n2\n00:00:02,000 --> 00:00:04,000\ndu Seigneur pour chacun de nous aujourd’hui.\n';
		const pdf =
			'Nous avons entendu les paroles de consolation du Seigneur pour chacun de nous aujourd’hui.';
		expect(correctSubtitleSrt(srt, pdf).text).toBe(srt);
	});

	it('keeps spoken words omitted by the PDF and ignores page numbers', () => {
		const srt =
			'1\n00:00:00,000 --> 00:00:02,000\nNous avons entendu les paroles et la prière pour chacun de nous aujourd’hui.\n';
		const omitted = 'Nous avons entendu les paroles la prière pour chacun de nous aujourd’hui.';
		const numbered =
			'Nous avons entendu les paroles et 17 la prière pour chacun de nous aujourd’hui.';
		expect(correctSubtitleSrt(srt, omitted).text).toBe(srt);
		expect(correctSubtitleSrt(srt, numbered).text).toBe(srt);
	});

	it('reuses recurring PDF discoveries on a new subtitle without a linked PDF', () => {
		const srt =
			'1\n00:00:00,000 --> 00:00:03,000\nFrère Rousse et Ewald Franck lisent hébreux 11 avec abraham dans leur coeur.\n';
		const corrected = correctSubtitleSrt(srt);
		expect(corrected.text).toContain(
			'Frère Russ et Ewald Frank lisent Hébreux 11 avec Abraham dans leur cœur.'
		);
		expect(correctSubtitleSrt(corrected.text).text).toBe(corrected.text);
	});
});
