<script>
  import { onMount } from "svelte";
  import Legend from "./Legend.svelte";
  import Axes from "./Axes.svelte";
  import Details from "./Details.svelte";
  import { TerrainGenerator } from "../../lib/map/noise.js";

  // Initialize the terrain generator with a fixed seed
  const WORLD_SEED = 12345;
  const terrain = new TerrainGenerator(WORLD_SEED);
  
  // Position and drag state
  let isDragging = false;
  let isMouseActuallyDown = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let targetCoord = { x: 0, y: 0 };

  // UI state
  let showDetailsModal = false;
  let keysPressed = new Set();
  let keyboardNavigationInterval = null;
  
  // Configuration
  const KEYBOARD_MOVE_SPEED = 200;
  const CHUNK_SIZE = 20;
  const tileSize = 7.5;
  const showAxisBars = true;
  const DRAG_CHECK_INTERVAL = 500;
  
  // Map elements
  let mapElement;
  let cols = 0, rows = 0;
  let isReady = false;
  let resizeObserver;
  let offsetX = 0, offsetY = 0;
  let visibleChunks = new Set();
  let dragStateCheckInterval = null;
  let centerX = 0;
  let centerY = 0;
  
  // Calculate grid dimensions and update on resize
  const resize = () => {
    const baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const tileSizePx = tileSize * baseFontSize;
    const width = mapElement.clientWidth;
    const height = mapElement.clientHeight;

    cols = Math.ceil(width / tileSizePx);
    cols = cols % 2 === 0 ? cols - 1 : cols;

    rows = Math.ceil(height / tileSizePx);
    rows = rows % 2 === 0 ? rows - 1 : rows;

    centerX = Math.floor(cols / 2);
    centerY = Math.floor(rows / 2);
    offsetX = centerX + targetCoord.x;
    offsetY = centerY + targetCoord.y;

    if (!isReady) isReady = true;
  };

  // Initialize when mounted
  onMount(() => {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mapElement);
    resize();
    setupKeyboardNavigation();
    dragStateCheckInterval = setInterval(checkDragState, DRAG_CHECK_INTERVAL);

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      if (keyboardNavigationInterval) clearInterval(keyboardNavigationInterval);
      if (dragStateCheckInterval) clearInterval(dragStateCheckInterval);
    };
  });

  // Setup keyboard navigation
  const setupKeyboardNavigation = () => {
    window.addEventListener("keydown", event => {
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright"].includes(key)) {
        keysPressed.add(key);

        if (!keyboardNavigationInterval) {
          moveMapByKeys();
          keyboardNavigationInterval = setInterval(moveMapByKeys, KEYBOARD_MOVE_SPEED);
        }

        if (key.startsWith("arrow")) event.preventDefault();
      }
    });

    window.addEventListener("keyup", event => {
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright"].includes(key)) {
        keysPressed.delete(key);

        if (keysPressed.size === 0 && keyboardNavigationInterval) {
          clearInterval(keyboardNavigationInterval);
          keyboardNavigationInterval = null;
        }
      }
    });
  };

  // Move map based on keyboard input
  const moveMapByKeys = () => {
    let xChange = 0;
    let yChange = 0;

    if (keysPressed.has("a") || keysPressed.has("arrowleft")) xChange -= 1;
    if (keysPressed.has("d") || keysPressed.has("arrowright")) xChange += 1;
    if (keysPressed.has("w") || keysPressed.has("arrowup")) yChange -= 1;
    if (keysPressed.has("s") || keysPressed.has("arrowdown")) yChange += 1;

    if (xChange !== 0 || yChange !== 0) {
      targetCoord.x -= xChange;
      targetCoord.y -= yChange;
      offsetX = centerX + targetCoord.x;
      offsetY = centerY + targetCoord.y;
      targetCoord = { ...targetCoord };
    }
  };

  // Get chunk key from coordinates
  const getChunkKey = (x, y) => `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)}`;

  // Update visible chunks log
  const updateChunks = gridArray => {
    const newChunkKeys = gridArray.map(cell => getChunkKey(cell.x, cell.y));
    const newVisibleChunks = new Set(newChunkKeys);

    Array.from(newVisibleChunks)
      .filter(chunkKey => !visibleChunks.has(chunkKey))
      .forEach(chunkKey => console.log(`Chunk loaded: ${chunkKey}`));

    Array.from(visibleChunks)
      .filter(chunkKey => !newVisibleChunks.has(chunkKey))
      .forEach(chunkKey => console.log(`Chunk unloaded: ${chunkKey}`));

    visibleChunks = newVisibleChunks;
  };

  // Generate reactive grid arrays
  $: gridArray = isReady
    ? Array.from({ length: rows }, (_, y) =>
        Array.from({ length: cols }, (_, x) => {
          const globalX = x - offsetX;
          const globalY = y - offsetY;
          const terrainData = terrain.getTerrainData(globalX, globalY);
          
          return {
            x: globalX,
            y: globalY,
            isCenter: x === centerX && y === centerY,
            ...terrainData
          };
        })
      ).flat()
    : [];

  $: if (isReady && gridArray.length > 0) updateChunks(gridArray);

  $: xAxisArray = isReady
    ? Array.from({ length: cols }, (_, x) => ({
        value: x - offsetX,
        isCenter: x === centerX
      }))
    : [];

  $: yAxisArray = isReady
    ? Array.from({ length: rows }, (_, y) => ({
        value: y - offsetY,
        isCenter: y === centerY
      }))
    : [];

  // Check drag state consistency
  const checkDragState = () => {
    if (!isMouseActuallyDown && isDragging) stopDrag();
  };

  // Drag handling
  const startDrag = event => {
    if (event.button !== 0) return;
    
    isDragging = true;
    isMouseActuallyDown = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    
    document.body.style.cursor = "grabbing";
    if (mapElement) {
      mapElement.style.cursor = "grabbing";
      mapElement.classList.add("dragging");
    }
    
    event.preventDefault();
  };

  const drag = event => {
    if (!isDragging) return;

    const deltaX = event.clientX - dragStartX;
    const deltaY = event.clientY - dragStartY;
    
    const baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const tileSizePx = tileSize * baseFontSize;
    
    const cellsMovedX = Math.round(deltaX / tileSizePx);
    const cellsMovedY = Math.round(deltaY / tileSizePx);
    
    if (cellsMovedX !== 0 || cellsMovedY !== 0) {
      targetCoord.x -= cellsMovedX;
      targetCoord.y -= cellsMovedY;
      offsetX = centerX + targetCoord.x;
      offsetY = centerY + targetCoord.y;
      targetCoord = { ...targetCoord };
      dragStartX = event.clientX;
      dragStartY = event.clientY;
    }
  };

  const stopDrag = () => {
    if (!isDragging) return;
    
    isDragging = false;
    document.body.style.cursor = "default";
    
    if (mapElement) {
      mapElement.style.cursor = "grab";
      mapElement.classList.remove("dragging");
    }
  };

  // Global mouse events
  const globalMouseDown = () => isMouseActuallyDown = true;
  const globalMouseUp = () => {
    isMouseActuallyDown = false;
    if (isDragging) stopDrag();
    document.body.style.cursor = "default";
  };
  const globalMouseMove = event => {
    if (isMouseActuallyDown && isDragging) drag(event);
    else if (!isMouseActuallyDown && isDragging) stopDrag();
  };
  const globalMouseLeave = () => { if (isDragging) stopDrag(); };
  const visibilityChange = () => { if (document.visibilityState === 'hidden' && isDragging) stopDrag(); };

  // Open details modal
  const openDetails = () => {
    // Get fresh data before opening the modal
    if (isReady) {
      centerTileData = terrain.getTerrainData(targetCoord.x, targetCoord.y);
    }
    showDetailsModal = true;
  };

  // Ensure dragging class is removed
  $: if (!isDragging && mapElement && mapElement.classList.contains('dragging'))
    mapElement.classList.remove('dragging');

  // Generate center tile data for Details component
  let centerTileData = null;
  
  // Update terrain data with negated coordinates
  $: if (isReady) {
    // Get fresh terrain data when coordinates change or modal opens
    centerTileData = terrain.getTerrainData(-targetCoord.x, -targetCoord.y);
  }
  
  // Update the details whenever the modal is opened
  $: if (showDetailsModal && isReady) {
    centerTileData = terrain.getTerrainData(-targetCoord.x, -targetCoord.y);
  }
</script>

<svelte:window
  on:mousedown={globalMouseDown}
  on:mouseup={globalMouseUp}
  on:mousemove={globalMouseMove}
  on:mouseleave={globalMouseLeave}
  on:blur={() => isDragging && stopDrag()}
  on:visibilitychange={visibilityChange}
/>

<div class="map-container" style="--tile-size: {tileSize}em;" class:modal-open={showDetailsModal}>
  <div
    class="map"
    bind:this={mapElement}
    on:mousedown={startDrag}
    class:dragging={isDragging}
    role="grid"
    tabindex="0"
    aria-label="Interactive coordinate map. Use WASD or arrow keys to navigate."
  >
    {#if isReady}
      <div class="grid main-grid" style="--cols: {cols}; --rows: {rows};" role="presentation">
        {#each gridArray as cell}
          <div
            class="tile"
            class:center={cell.isCenter}
            role="gridcell"
            aria-label="Coordinates {cell.x},{cell.y}, biome: {cell.biome.name}"
            aria-current={cell.isCenter ? "location" : undefined}
            style="background-color: {cell.color};"
            title="{cell.biome.name} ({cell.x},{cell.y})"
          >
            <span class="coords">{cell.x},{cell.y}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <Legend x={targetCoord.x} y={targetCoord.y} {openDetails} />

  {#if showAxisBars && isReady}
    <Axes {xAxisArray} {yAxisArray} {cols} {rows} />
  {/if}

  <Details 
    x={targetCoord.x} 
    y={targetCoord.y} 
    bind:show={showDetailsModal}
    biome={centerTileData?.biome || { name: "unknown", color: "#808080" }}
    height={centerTileData?.height || 0}
    moisture={centerTileData?.moisture || 0}
    continent={centerTileData?.continent || 0}
    slope={centerTileData?.slope || 0}
    riverValue={centerTileData?.riverValue || 0}
    lakeValue={centerTileData?.lakeValue || 0}
    displayColor={centerTileData?.color || "#808080"}
  />
</div>

<style>
  .map-container {
    position: relative;
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: var(--color-dark-blue);
    user-select: none;
  }

  /* Map takes full container space */
  .map {
    width: 100%;
    height: 100%;
    cursor: grab;
    overflow: hidden;
    box-sizing: border-box;
    background: linear-gradient(
      135deg,
      var(--color-dark-navy),
      var(--color-dark-blue)
    );
  }

  .grid {
    display: grid;
    box-sizing: border-box;
  }

  .main-grid {
    grid-template-columns: repeat(var(--cols), 1fr);
    grid-template-rows: repeat(var(--rows), 1fr);
    width: 100%;
    height: 100%;
  }

  .tile {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0.05em solid rgba(0, 0, 0, 0.1);
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 1.2em;
    color: rgba(255, 255, 255, 0.7);
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.5);
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    transition: filter 0.1s ease-in-out, transform 0.1s ease-in-out;
  }

  /* Replace the hover and drag state CSS */
  .map:not(.dragging) .tile:hover {
    z-index: 2;
    filter: brightness(1.2);
  }
  
  .map.dragging .tile {
    pointer-events: none;
    cursor: grabbing;
    filter: none;
    transform: none;
    z-index: auto;
  }

  /* Enhanced center tile styling */
  .center {
    z-index: 3;
    position: relative;
    filter: brightness(1.1);
    border: 0.12em solid rgba(255, 255, 255, 0.5) !important;
    box-shadow: 
      inset 0 0 0.5em rgba(255, 255, 255, 0.3),
      0 0 1em rgba(255, 255, 255, 0.2);
    transform: scale(1.05);
  }

  /* Create a subtle pulsing animation for the center tile */
  @keyframes pulse {
    0% { box-shadow: inset 0 0 0.5em rgba(255, 255, 255, 0.3), 0 0 1em rgba(255, 255, 255, 0.2); }
    50% { box-shadow: inset 0 0 0.8em rgba(255, 255, 255, 0.4), 0 0 1.5em rgba(255, 255, 255, 0.3); }
    100% { box-shadow: inset 0 0 0.5em rgba(255, 255, 255, 0.3), 0 0 1em rgba(255, 255, 255, 0.2); }
  }

  .center {
    animation: pulse 2s infinite ease-in-out;
  }

  .coords {
    font-size: 0.7em;
    opacity: 0.6;
  }

  .map-container.modal-open {
    cursor: grab;
  }

  .map-container.modal-open .map {
    pointer-events: all; /* Ensure map still receives pointer events when modal is open */
  }
</style>
