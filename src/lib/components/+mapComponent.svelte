<script>
	import { onMount } from 'svelte';
	// @ts-ignore
	import { Loader } from '@googlemaps/js-api-loader';

	let map;
	// @ts-ignore
	let directionsService;
	// @ts-ignore
	let directionsRenderer;
	let center = { lat: -1.9764085434636591, lng: 30.09164164940503 }; // Example coordinates
	let destination = { lat: -1.9829317239823283, lng: 30.089299358595436 }; // Example destination coordinates
	let loader = new Loader({
		apiKey: 'AIzaSyCS5-5ITNSGHunCL_r6LhtQBcmEo6aEbBQ  ', // Replace with your Google Maps API key
		version: 'weekly'
	});

	// @ts-ignore
	let mapContainer;

	onMount(async () => {
		await loader.load();

		// @ts-ignore
		map = new google.maps.Map(mapContainer, {
			center: center,
			zoom: 14
		});

		// @ts-ignore
		directionsService = new google.maps.DirectionsService();
		// @ts-ignore
		directionsRenderer = new google.maps.DirectionsRenderer({ map: map });

		calculateAndDisplayRoute();
	});

	function calculateAndDisplayRoute() {
		// @ts-ignore
		directionsService.route(
			{
				origin: center,
				destination: destination,
				travelMode: 'DRIVING' // You can change this to other modes like 'WALKING', 'BICYCLING', or 'TRANSIT'
			},
			// @ts-ignore
			(response, status) => {
				if (status === 'OK') {
					// @ts-ignore
					directionsRenderer.setDirections(response);
				} else {
					window.alert('Directions request failed due to ' + status);
				}
			}
		);
	}
</script>

<div class="map-container" bind:this={mapContainer} />

<style>
	/* Set the map container's size */
	.map-container {
		width: 100%;
		height: 500px;
		border-radius: 20px; /* Adjust the height as needed */
	}
</style>
