export type Methods = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
import { PUBLIC_MAIN_URL } from '$env/static/public';

const URLInstance = new URL(PUBLIC_MAIN_URL || 'http://localhost:8080/');

export default class ApiRepository {
	private requestDefaultHeaders: HeadersInit;
	constructor() {
		this.requestDefaultHeaders = {
			Accept: 'application/json; charset=utf-8'
		};
	}
	async get(endpoint: string): Promise<any> {
		return this._request(endpoint, 'GET');
	}
	async post(endpoint: string, requestBody: { [key: string]: any }): Promise<any> {
		return this._request(endpoint, 'POST', requestBody);
	}
	async delete(endpoint: string, requestBody: { [key: string]: any }): Promise<any> {
		return this._request(endpoint, 'DELETE', requestBody);
	}
	async update(endpoint: string, requestBody: { [key: string]: any }): Promise<any> {
		return this._request(endpoint, 'PUT', requestBody);
	}
	async request(url: URL, method: Methods, requestBody?: { [key: string]: any }): Promise<any> {
		return this._request(url, method, requestBody);
	}
	async _request(endpoint: URL | string, method: Methods, requestBody?: { [key: string]: any }) {
		const headers = this._getHeaders();
		const response = await fetch(endpoint instanceof URL ? endpoint.toString() : endpoint, {
			method: method,
			headers,
			body: requestBody ? JSON.stringify(requestBody) : undefined,
			mode: 'cors'
		});
		const payload = await response.json();
		if (!response.ok) {
			throw new Error(payload.message);
		}

		return payload;
	}

	private _getHeaders() {
		const headers = {
			...this.requestDefaultHeaders
		};
		return headers;
	}
}

export { URLInstance };
