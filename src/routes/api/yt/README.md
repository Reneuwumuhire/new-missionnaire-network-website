# YT API

## Desc

> Fetch Youtube videos ordered by date ```GET /api/yt/recent-videos```.

## Query Params
- _**resultsPerPage**_              **10** _DEFAULT_

## Example
```JS

var requestOptions = {
  method: 'GET',
};

const response = await fetch("/api/yt/recent-videos?resultsPerPage=50", requestOptions);
const responseData = await res.json();

```

## Response Data


```TS
type ResultType = {
    resultsPerPage: number,
    videos: {
        id: string;
        publishedAt: Date;
        title: string;
        description: string;
        thumbNails: {
            default: {
                url: string;
                width: number;
                height: number;
            };
            medium: {
                url: string;
                width: number;
                height: number;
            };
            high: {
                url: string;
                width: number;
                height: number;
            };
        }
    }[]
}

```