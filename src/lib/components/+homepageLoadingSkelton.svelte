<div class="w-full animate-pulse space-y-12 pb-12">
    <!-- Hero Skeleton -->
    <div class="w-full h-[60vh] max-h-[600px] min-h-[400px] bg-gray-100 rounded-3xl relative overflow-hidden">
        <div class="absolute bottom-0 left-0 w-full p-6 md:p-12 space-y-6">
            <div class="space-y-3">
                <div class="h-4 bg-gray-200 rounded-full w-24"></div> <!-- Label -->
                <div class="h-8 md:h-14 bg-gray-200 rounded-xl w-11/12 md:w-2/3"></div> <!-- Title -->
                <div class="h-8 md:h-14 bg-gray-200 rounded-xl w-2/3 md:w-1/2 hidden md:block"></div> <!-- Title line 2 -->
            </div>
            
            <div class="flex gap-4 pt-4">
                <div class="h-12 w-32 bg-gray-200 rounded-full"></div> <!-- Button -->
                <div class="h-12 w-32 bg-gray-200 rounded-full hidden sm:block"></div> <!-- Button -->
            </div>
        </div>
    </div>

    <!-- Grid Section -->
    <div class="space-y-8">
        <!-- Section Header -->
        <div class="flex justify-between items-end">
             <div class="space-y-2">
                <div class="h-3 w-32 bg-gray-200 rounded-full"></div>
                <div class="h-8 w-64 bg-gray-200 rounded-lg"></div>
             </div>
        </div>

        <!-- Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
            {#each Array(8) as _}
                <div class="flex flex-col gap-4">
                    <!-- Thumbnail -->
                    <div class="aspect-video bg-gray-100 rounded-xl w-full"></div>
                    
                    <!-- Metadata -->
                    <div class="space-y-3">
                        <div class="flex justify-between items-start">
                            <div class="h-4 bg-gray-200 rounded w-3/4"></div>
                            <div class="h-4 bg-gray-200 rounded w-10"></div>
                        </div>
                        <div class="h-3 bg-gray-200 rounded w-1/2"></div>
                    </div>
                </div>
            {/each}
        </div>
    </div>
</div>
