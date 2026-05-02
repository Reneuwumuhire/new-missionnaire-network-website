function submitControls(form: HTMLFormElement) {
	return form.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
		'button[type="submit"], button:not([type]), input[type="submit"]'
	);
}

type SubmitControl = HTMLButtonElement | HTMLInputElement;

type ControlState = {
	disabled: boolean;
	ariaDisabled: string | null;
	ariaBusy: string | null;
	label: string;
};

function setLoadingLabel(submitter: SubmitControl, label: string) {
	if (submitter instanceof HTMLButtonElement) {
		submitter.textContent = label;
		return;
	}

	submitter.value = label;
}

function controlLabel(control: SubmitControl): string {
	return control instanceof HTMLButtonElement ? (control.textContent ?? '') : control.value;
}

function restoreControl(control: SubmitControl, state: ControlState) {
	control.disabled = state.disabled;
	if (state.ariaDisabled === null) control.removeAttribute('aria-disabled');
	else control.setAttribute('aria-disabled', state.ariaDisabled);

	if (state.ariaBusy === null) control.removeAttribute('aria-busy');
	else control.setAttribute('aria-busy', state.ariaBusy);

	control.classList.remove('admin-submit-loading');
	setLoadingLabel(control, state.label);
}

export function loadingSubmit(form: HTMLFormElement) {
	let resetTimer: number | null = null;
	const controlStates = new Map<SubmitControl, ControlState>();

	function remember(control: SubmitControl) {
		if (controlStates.has(control)) return;
		controlStates.set(control, {
			disabled: control.disabled,
			ariaDisabled: control.getAttribute('aria-disabled'),
			ariaBusy: control.getAttribute('aria-busy'),
			label: controlLabel(control)
		});
	}

	function resetLoading() {
		if (resetTimer !== null) {
			window.clearTimeout(resetTimer);
			resetTimer = null;
		}

		for (const [control, state] of controlStates) {
			restoreControl(control, state);
		}

		controlStates.clear();
		delete form.dataset.submitting;
	}

	function startLoading(submitter: SubmitControl | null) {
		form.dataset.submitting = 'true';

		for (const control of submitControls(form)) {
			remember(control);
			control.disabled = true;
			control.setAttribute('aria-disabled', 'true');
		}

		if (submitter) {
			remember(submitter);
			const label = submitter.dataset.loadingLabel || 'Traitement...';
			submitter.classList.add('admin-submit-loading');
			submitter.setAttribute('aria-busy', 'true');
			setLoadingLabel(submitter, label);
		}

		if (form.method.toLowerCase() === 'get') {
			resetTimer = window.setTimeout(resetLoading, 1200);
		}
	}

	function onSubmit(event: SubmitEvent) {
		if (form.dataset.submitting === 'true') {
			event.preventDefault();
			return;
		}

		if (event.defaultPrevented) return;

		const submitter: SubmitControl | null =
			event.submitter instanceof HTMLButtonElement || event.submitter instanceof HTMLInputElement
				? event.submitter
				: null;

		queueMicrotask(() => {
			if (event.defaultPrevented) return;
			startLoading(submitter);
		});
	}

	form.addEventListener('submit', onSubmit);
	window.addEventListener('pageshow', resetLoading);

	return {
		destroy() {
			resetLoading();
			form.removeEventListener('submit', onSubmit);
			window.removeEventListener('pageshow', resetLoading);
		}
	};
}
