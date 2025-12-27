export interface ArgsToGetVideos {
	videoCount: number;
	startAfter?: number;
}

export interface ArgsToGetSermonVideos {
	videoCount: number;
	pageNumber: number;
	type: string[];
}

export interface ArgsToGetAudios {
	audioCount: number;
	startAfter: number;
}
