// Small UI helpers shared by the list and the dialogs.

/**
 * Make a button need two taps. The first tap changes its label to `armedLabel`
 * for a few seconds; a second tap in that time runs `onConfirm`. This guards
 * destructive buttons against stray touches without a pop-up.
 */
export function confirmTap(button, label, armedLabel, onConfirm, timeoutMs = 3000) {
	let timer = null;

	const disarm = () => {
		if (timer !== null) {
			window.clearTimeout(timer);
			timer = null;
		}
		button.setText(label);
		button.removeClass("mod-warning");
	};

	button.addEventListener("click", () => {
		if (timer === null) {
			button.setText(armedLabel);
			button.addClass("mod-warning");
			timer = window.setTimeout(disarm, timeoutMs);
			return undefined;
		}
		disarm();
		return onConfirm();
	});
}
