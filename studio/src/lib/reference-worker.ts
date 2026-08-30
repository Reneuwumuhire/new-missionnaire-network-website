import { ReferenceIndex, type Match } from './reference-match';

type Request =
	| { type: 'reference'; features: Float32Array }
	| {
			type: 'match';
			live: Float32Array;
			capturedFrame: number;
			generation: number;
			expectedStart?: number;
	  };

type Response = {
	type: 'match';
	match: Match | null;
	capturedFrame: number;
	generation: number;
};

let index: ReferenceIndex | null = null;

self.onmessage = ({ data }: MessageEvent<Request>) => {
	if (data.type === 'reference') {
		index = new ReferenceIndex(data.features);
		return;
	}
	const response: Response = {
		type: 'match',
		match: index?.match(data.live, data.expectedStart) ?? null,
		capturedFrame: data.capturedFrame,
		generation: data.generation
	};
	self.postMessage(response);
};
