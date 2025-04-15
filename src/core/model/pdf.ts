export interface PDF {
	_id: string;
	videoId?: string;
	videoDisplayId?: string;
	filename: string;
	s3Key: string;
	size: number;
	uploadDate: Date;
	url: string;
	publishedOn: Date;
}
