#### Endpoint: `GET /api/yt/videos/query?searchTags=branham,frank&limit=5&pageNumber=1`

```ts
const searchParam = {
    limit: number;
    pageNumber: number;
    searchTags?: void | ("branham" | "william" | "ewald" | "frank" | "local" | "song" | "any" | "predication" | "retransmission" | "ibaruwa" | "lettre" | "circulaire")[] ;
    startDate: Date,
    endDate: Date
}
```

## Response

> Response code: `400`

```ts
const resultBody = {
	message:
		'invalid_type: search tag should be any of the following: branham, william, ewald, frank, local, song, any, predication, retransmission, ibaruwa, lettre, circulaire'
};
```

> Response code: `200`

```ts
const resultBody: Result<YoutubeVideo[]>;
```
