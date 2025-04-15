import React, { useEffect, useState, useRef, useCallback, useMemo, memo } from 'react';
import { Info, Ship, Menu, ZoomIn, ZoomOut, Radar, Waves, Layers, Wind, Radio } from 'lucide-react';
import '../styles/palantir-theme.css';
import { GoogleMap, useJsApiLoader, Marker, Circle, Polyline, Polygon } from '@react-google-maps/api';

// Memoized components for better performance
const MemoizedMarker = memo(Marker);
const MemoizedCircle = memo(Circle);
const MemoizedPolygon = memo(Polygon);

// Define container style
const mapContainerStyle = {
  width: '100%',
  height: '100vh'
};

// Define center for the Baltic Sea
const defaultCenter = {
  lat: 59,
  lng: 19
};

const BalticSeaTracker = () => {
  // Use the same API key and configuration that worked in SimpleMap
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: 'AIzaSyAl-iGmFThUduVpLpE7sQTmniBSUPtzJjA',
    libraries: ['geometry', 'drawing']
  });
  
  console.log("Map loading status:", { isLoaded, loadError });

  const [vessels, setVessels] = useState([]);
  const [selectedVessel, setSelectedVessel] = useState(null);
  const [filters, setFilters] = useState({
    all: true,
    commercial: false,
    military: false,
    submarine: false,
    drone: false,
    russian: false
  });
  const [showSidebar, setShowSidebar] = useState(true);
  const [displayMode, setDisplayMode] = useState('radar'); // Only 'radar' mode is available now
  const [showWindFarms, setShowWindFarms] = useState(false);
  const [showRadarCoverage, setShowRadarCoverage] = useState(false); // New state for radar coverage
  const [showVesselRadar, setShowVesselRadar] = useState(false); // State for vessel radar coverage (300-2999 GT)
  const [showLargeVesselRadar, setShowLargeVesselRadar] = useState(false); // New state for large vessel radar (>3000 GT)
  const [showSeaMesh, setShowSeaMesh] = useState(false); // State for SeaMesh interception visualization
  const [showAirMesh, setShowAirMesh] = useState(false); // State for AirMesh drone interception visualization
  const [mapBounds, setMapBounds] = useState(null); // Track current map bounds
  const [currentZoom, setCurrentZoom] = useState(6); // Track current zoom level
  const [mapKey, setMapKey] = useState(Date.now()); // Add key to force remount of map components
  const [simulationEnabled, setSimulationEnabled] = useState(false); // Track if vessel movement simulation is enabled
  const [simulationSpeed, setSimulationSpeed] = useState(10); // Simulation speed multiplier (default 10x)
  const animationFrameRef = useRef(null); // Reference to store animation frame ID
  const lastUpdateTimeRef = useRef(Date.now()); // Reference to store last update time
  
  const zoomRef = useRef(null);
  const mapRef = useRef(null);
  
  // Google Maps settings
  const mapCenter = defaultCenter; // Use the default center
  const mapZoom = 6;
  
  // Add state to track current map center
  const [currentMapCenter, setCurrentMapCenter] = useState(defaultCenter);
  
  // Memoize map style to prevent recalculations
  const mapStyle = useMemo(() => getMapStyle(displayMode), [displayMode]);
  
  const mapOptions = useMemo(() => ({
    disableDefaultUI: true,
    zoomControl: false,
    styles: mapStyle,
    draggable: true, // Ensure map is draggable
    // Hide cities with population under 5000
    restrictions: {
      latLngBounds: {
        north: 66.0,
        south: 54.0,
        east: 30.0,
        west: 9.0,
      }
    }
  }), [mapStyle]);
  
  // Create a ref to track if Google Maps loaded
  const mapsLoadedRef = useRef(false);
  
  // Log any errors with Google Maps loading
  useEffect(() => {
    if (loadError) {
      console.error('Error loading Google Maps:', loadError);
    }
    if (isLoaded && !mapsLoadedRef.current) {
      console.log('Google Maps API loaded successfully');
      mapsLoadedRef.current = true;
    }
  }, [isLoaded, loadError]);
  
  // Function to get map style based on display mode
  function getMapStyle(mode) {
    switch (mode) {
      case 'radar':
        return [
          { elementType: "geometry", stylers: [{ color: "#212121" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#181818" }] },
          { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3d3d3d" }] },
          { featureType: "poi", stylers: [{ visibility: "off" }] },
          { featureType: "transit", stylers: [{ visibility: "off" }] },
          { featureType: "road", stylers: [{ visibility: "off" }] },
          // Hide smaller cities/towns
          { featureType: "administrative.locality", elementType: "labels", 
            stylers: [{ visibility: "off" }] },
          // Only show major cities
          { featureType: "administrative.locality", elementType: "labels", 
            filter: [">=", ["get", "population"], 10000],
            stylers: [{ visibility: "on" }] }
        ];
      
      // Remove sonar and fused cases
      default:
        return [
          { elementType: "geometry", stylers: [{ color: "#212121" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#181818" }] },
          { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3d3d3d" }] },
          { featureType: "poi", stylers: [{ visibility: "off" }] },
          { featureType: "transit", stylers: [{ visibility: "off" }] },
          { featureType: "road", stylers: [{ visibility: "off" }] },
          // Hide smaller cities/towns
          { featureType: "administrative.locality", elementType: "labels", 
            stylers: [{ visibility: "off" }] },
          // Only show major cities
          { featureType: "administrative.locality", elementType: "labels", 
            filter: [">=", ["get", "population"], 10000],
            stylers: [{ visibility: "on" }] }
        ];
    }
  }
    
  // Function to generate a random coordinate within Baltic Sea
  const randomCoordinate = () => {
    // Areas to avoid - major inland lakes and problematic areas
    const avoidAreas = [
      // Swedish lakes
      {minLat: 58.0, maxLat: 59.3, minLng: 12.3, maxLng: 14.0}, // Vänern
      {minLat: 57.7, maxLat: 58.7, minLng: 14.0, maxLng: 14.8}, // Vättern
      {minLat: 59.1, maxLat: 59.7, minLng: 15.8, maxLng: 18.0}, // Mälaren
      
      // Finnish lakes
      {minLat: 61.0, maxLat: 62.3, minLng: 24.5, maxLng: 26.4}, // Päijänne
      {minLat: 61.3, maxLat: 63.1, minLng: 26.5, maxLng: 29.0}, // Saimaa
      
      // Other inland waters to avoid
      {minLat: 60.0, maxLat: 61.8, minLng: 29.2, maxLng: 32.0}, // Ladoga
      {minLat: 57.8, maxLat: 59.0, minLng: 26.5, maxLng: 28.5},  // Peipus
      
      // Problematic shore areas - Northern Sweden west coast
      {minLat: 60.0, maxLat: 65.0, minLng: 17.0, maxLng: 19.5},
      
      // Problematic shore areas - Northern Finland west coast
      {minLat: 63.0, maxLat: 65.5, minLng: 22.5, maxLng: 25.0}
    ];
    
    // Combine shipping lanes with wider dispersal areas
    const shippingLanes = [
      // Main shipping lanes (lower weight than before to reduce clustering)
      // Danish Straits to St. Petersburg
      {minLat: 54.5, maxLat: 55.2, minLng: 10.8, maxLng: 13.0, weight: 5}, // Danish Straits entrance
      {minLat: 55.0, maxLat: 55.8, minLng: 12.8, maxLng: 14.5, weight: 4}, // Route east of Denmark
      {minLat: 55.3, maxLat: 56.2, minLng: 14.5, maxLng: 16.5, weight: 4}, // Southern Sweden coast
      {minLat: 55.0, maxLat: 56.0, minLng: 16.5, maxLng: 18.5, weight: 3}, // Midway to Gotland
      {minLat: 57.0, maxLat: 58.2, minLng: 18.5, maxLng: 20.0, weight: 4}, // North of Gotland
      {minLat: 58.5, maxLat: 59.5, minLng: 20.0, maxLng: 22.0, weight: 3}, // Approach to Gulf of Finland
      {minLat: 59.2, maxLat: 59.8, minLng: 22.0, maxLng: 24.5, weight: 5}, // Gulf of Finland western part
      {minLat: 59.7, maxLat: 60.2, minLng: 24.5, maxLng: 28.0, weight: 4}, // Gulf of Finland eastern part
      
      // Port approaches - reduced weights to prevent clustering
      {minLat: 60.0, maxLat: 60.5, minLng: 24.5, maxLng: 25.0, weight: 3}, // Helsinki
      {minLat: 60.2, maxLat: 60.5, minLng: 22.0, maxLng: 22.5, weight: 3}, // Turku
      {minLat: 55.3, maxLat: 56.3, minLng: 12.5, maxLng: 13.0, weight: 3}, // Malmö
      {minLat: 58.5, maxLat: 59.5, minLng: 16.5, maxLng: 18.5, weight: 3}, // Stockholm
      {minLat: 54.3, maxLat: 54.8, minLng: 18.3, maxLng: 19.0, weight: 3}, // Gdańsk
      {minLat: 54.0, maxLat: 54.5, minLng: 13.0, maxLng: 14.5, weight: 3}, // Rostock
      
      // Wider dispersal areas - these ensure ships are spread throughout the entire sea
      // Central Baltic - large dispersal areas
      {minLat: 56.0, maxLat: 58.0, minLng: 17.0, maxLng: 20.0, weight: 5}, // Central Baltic wider area
      {minLat: 57.5, maxLat: 59.5, minLng: 19.0, maxLng: 22.0, weight: 5}, // Eastern Baltic wider area
      
      // Gulf of Bothnia - more dispersed
      {minLat: 60.0, maxLat: 62.0, minLng: 18.0, maxLng: 21.0, weight: 4}, // Southern Bothnia dispersed
      {minLat: 62.0, maxLat: 65.0, minLng: 18.0, maxLng: 23.0, weight: 3}, // Northern Bothnia dispersed
      
      // Western Baltic - more dispersed
      {minLat: 54.0, maxLat: 56.0, minLng: 12.0, maxLng: 15.0, weight: 4}, // Western Baltic dispersed
      {minLat: 54.0, maxLat: 57.0, minLng: 15.0, maxLng: 18.0, weight: 5}, // South-central Baltic dispersed
      
      // Other dispersed areas to ensure wider coverage
      {minLat: 54.0, maxLat: 55.5, minLng: 18.0, maxLng: 20.0, weight: 3}, // Southern Baltic dispersed
      {minLat: 56.5, maxLat: 58.0, minLng: 15.0, maxLng: 17.0, weight: 3}, // Western Gotland dispersed
      {minLat: 57.0, maxLat: 58.5, minLng: 20.0, maxLng: 22.0, weight: 3}, // Eastern Gotland dispersed
      {minLat: 57.0, maxLat: 58.5, minLng: 22.0, maxLng: 24.0, weight: 3}, // Gulf of Riga dispersed
    ];
    
    // Calculate total weight
    const totalWeight = shippingLanes.reduce((sum, lane) => sum + lane.weight, 0);
    
    // Pick a random lane with weighting
    let randomPoint = Math.random() * totalWeight;
    let selectedLane = shippingLanes[0];
    let cumulativeWeight = 0;
    
    for (const lane of shippingLanes) {
      cumulativeWeight += lane.weight;
      if (randomPoint <= cumulativeWeight) {
        selectedLane = lane;
        break;
      }
    }
    
    // Generate random point
    const lng = selectedLane.minLng + Math.random() * (selectedLane.maxLng - selectedLane.minLng);
    const lat = selectedLane.minLat + Math.random() * (selectedLane.maxLat - selectedLane.minLat);
    
    // Check if the generated point is in an area to avoid
    for (const area of avoidAreas) {
      if (lat >= area.minLat && lat <= area.maxLat && lng >= area.minLng && lng <= area.maxLng) {
        // If in an avoid area, recursively try again (with a maximum call stack check)
        // This ensures we don't get stuck in an infinite loop
        if (randomCoordinate.callCount === undefined) {
          randomCoordinate.callCount = 0;
        }
        
        if (randomCoordinate.callCount < 10) {
          randomCoordinate.callCount++;
          const result = randomCoordinate();
          randomCoordinate.callCount--;
          return result;
        } else {
          // If we've tried too many times, just use a safe zone in the central Baltic
          randomCoordinate.callCount = 0;
          return [18.5 + Math.random() * 2, 56.5 + Math.random() * 2]; // Safe zone in central Baltic
        }
      }
    }
    
    // Reset call count
    if (randomCoordinate.callCount !== undefined) {
      randomCoordinate.callCount = 0;
    }
    
    // Return the coordinates
    return [lng, lat];
  };
  
  // Generate 300 simulated vessels with realistic properties (reduced from 1000)
  const generateVessels = useCallback(() => {
    const vesselTypes = ['commercial', 'military', 'fishing', 'passenger', 'tanker', 'drone'];
    const flags = ['Finland', 'Sweden', 'Estonia', 'Latvia', 'Lithuania', 'Poland', 'Germany', 'Denmark', 'Russia'];
    const russianOperators = ['Sovcomflot', 'Gazprom Fleet', 'Rosmorport', 'Russian Navy', 'Rosneft'];
    const commercialOperators = ['Maersk', 'MSC', 'CMA CGM', 'Hapag-Lloyd', 'ONE', 'Evergreen', 'COSCO', 
                                'Yang Ming', 'HMM', 'Grimaldi', 'DFDS', 'Stena Line', 'Tallink', 'Viking Line'];
    
    // Generate vessels with better dispersal throughout the Baltic Sea
    const generatedVessels = [];
    const occupiedPositions = []; // Track positions to ensure better dispersal
    const MIN_DISTANCE = 0.2; // Minimum distance between vessels in degrees (approx 10-20km)
    
    // Start with fewer vessels and then disperse them more effectively
    const maxAttempts = 600; // Increase attempts to find valid positions
    let placedVesselCount = 0;
    
    // Track vessel type counts for balancing
    let russianShipCount = 0;
    let militaryVesselCount = 0;
    
    // Maximum counts (adjust to double Russian ships and reduce military vessels)
    const MAX_RUSSIAN_SHIPS = 60; // Doubled from previous count
    const MAX_MILITARY_VESSELS = 40; // Reduced from previous count
    
    // Try to place vessels with appropriate spacing
    for (let i = 1; placedVesselCount < 300 && i <= maxAttempts; i++) {
      const initialType = vesselTypes[Math.floor(Math.random() * vesselTypes.length)];
      // Skip drone type in regular vessel generation (we'll add them separately)
      if (initialType === 'drone') continue;
      
      const flag = flags[Math.floor(Math.random() * flags.length)];
      let isRussian = flag === 'Russia'; // Only mark as Russian if it has a Russian flag
      
      // If vessel has Russian flag, it's always Russian
      // If not Russian flag but has a small chance to be operated by Russians,
      // make it military type instead of marking as Russian
      let vesselType = initialType;
      
      // All Russian flag vessels should be marked as "Russian Ships"
      if (isRussian && (vesselType === 'commercial' || vesselType === 'military' || vesselType === 'tanker')) {
        // Check if we've reached our maximum Russian Ships count
        if (russianShipCount >= MAX_RUSSIAN_SHIPS) {
          continue; // Skip this attempt
        }
        vesselType = 'russian'; // Set type to 'russian' for all Russian commercial, military and tanker vessels
        russianShipCount++;
      } else if (vesselType === 'military') {
        // Check if we've reached our maximum Military vessels count
        if (militaryVesselCount >= MAX_MILITARY_VESSELS) {
          continue; // Skip this attempt
        }
        militaryVesselCount++;
      } else if (!isRussian && Math.random() < 0.05) { // 5% chance of non-Russian flag but Russian operated
        // These will be military vessels with Russian operators but not marked as Russian ships
        // Check if we've reached our maximum Military vessels count
        if (militaryVesselCount >= MAX_MILITARY_VESSELS) {
          continue; // Skip this attempt
        }
        vesselType = 'military';
        militaryVesselCount++;
      }
      
      // Get a potential position for the vessel
      const position = randomCoordinate();
      
      // Skip positions that are not in Baltic Sea water
      if (!isInBalticSeaWaters(position[1], position[0])) {
        continue;
      }
      
      // Check if this position is too close to existing vessels
      let isTooClose = false;
      for (const existingPos of occupiedPositions) {
        const distance = Math.sqrt(
          Math.pow(position[0] - existingPos[0], 2) + 
          Math.pow(position[1] - existingPos[1], 2)
        );
        
        if (distance < MIN_DISTANCE) {
          isTooClose = true;
          break;
        }
      }
      
      // If the position is too close to other vessels, skip this attempt
      if (isTooClose) {
        continue;
      }
      
      // If we got here, the position is good, so add it to occupied positions
      occupiedPositions.push(position);
      placedVesselCount++;
      
      // Calculate a more realistic heading based on position
      // Ships in the Baltic generally move east-west in southern parts, and north-south in gulfs
      let heading;
      const vesselLat = position[1];
      const vesselLng = position[0];
      
      // Baltic shipping lane direction tendencies
      if (vesselLng < 14.0) {
        // Danish straits and western Baltic - generally east/west traffic
        heading = Math.random() < 0.7 ? 70 + Math.random() * 40 : 250 + Math.random() * 40;
      } else if (vesselLng > 23.0 && vesselLat > 59.0) {
        // Gulf of Finland - generally east/west traffic
        heading = Math.random() < 0.5 ? 80 + Math.random() * 30 : 260 + Math.random() * 30;
      } else if (vesselLng > 19.0 && vesselLat > 60.0) {
        // Gulf of Bothnia - generally north/south traffic
        heading = Math.random() < 0.5 ? 0 + Math.random() * 30 : 180 + Math.random() * 30;
      } else if (vesselLng > 22.0 && vesselLat < 58.0 && vesselLat > 56.5) {
        // Gulf of Riga - generally north/south traffic
        heading = Math.random() < 0.5 ? 0 + Math.random() * 40 : 180 + Math.random() * 40;
      } else if (vesselLat < 56.0 && vesselLng > 18.0) {
        // Southern Baltic to Polish/Lithuanian ports
        heading = Math.random() < 0.6 ? 140 + Math.random() * 40 : 320 + Math.random() * 40;
      } else {
        // Central Baltic - mixed traffic patterns
        heading = Math.floor(Math.random() * 360);
      }
      
      // Realistic speed based on vessel type and weather (assumed normal conditions)
      let speed;
      if (vesselType === 'commercial' || vesselType === 'tanker') {
        speed = 10 + Math.floor(Math.random() * 8); // 10-18 knots
      } else if (vesselType === 'passenger') {
        speed = 15 + Math.floor(Math.random() * 10); // 15-25 knots
      } else if (vesselType === 'military') {
        speed = 5 + Math.floor(Math.random() * 25); // 5-30 knots (more variable)
      } else if (vesselType === 'fishing') {
        // Fishing vessels move slower or may be stationary when fishing
        speed = Math.random() < 0.3 ? 0 : 5 + Math.floor(Math.random() * 7); // 0 or 5-12 knots
      } else {
        speed = Math.floor(Math.random() * 15) + 5; // 5-20 knots default
      }
      
      // Determine vessel size
      const length = vesselType === 'tanker' || vesselType === 'commercial' 
        ? 100 + Math.floor(Math.random() * 300) 
        : vesselType === 'military' 
          ? 50 + Math.floor(Math.random() * 200)
          : 20 + Math.floor(Math.random() * 50);
      
      // Calculate gross tonnage (GT) based on vessel length and type
      // Using simplified formula based on vessel dimensions
      let grossTonnage;
      if (vesselType === 'commercial' || vesselType === 'tanker') {
        // Commercial and tanker vessels have higher GT/length ratios
        grossTonnage = Math.round(length * length * 0.18); // Approximation
      } else if (vesselType === 'military') {
        // Military vessels are typically more dense but smaller
        grossTonnage = Math.round(length * length * 0.16);
      } else if (vesselType === 'passenger') {
        // Passenger vessels have high volume and less dense cargo
        grossTonnage = Math.round(length * length * 0.2);
      } else {
        // Fishing and other vessels
        grossTonnage = Math.round(length * length * 0.12);
      }
      
      // Determine operator - Russian military vessels might have Russian operators even with non-Russian flags
      let operator;
      if (isRussian || (vesselType === 'military' && !isRussian && Math.random() < 0.2)) {
        operator = russianOperators[Math.floor(Math.random() * russianOperators.length)];
      } else {
        operator = commercialOperators[Math.floor(Math.random() * commercialOperators.length)];
      }
      
      // Generate a realistic vessel name
      const prefixes = isRussian ? 
        ['Admiral', 'Kapitan', 'Vostok', 'Sibir', 'Moskva', 'Sankt-Peterburg', 'Akademik'] : 
        ['Northern', 'Baltic', 'Sea', 'Atlantic', 'Pacific', 'Star', 'Pioneer'];
      
      const suffixes = isRussian ?
        ['Kuznetsov', 'Nakhimov', 'Gorshkov', 'Lazarev', 'Kasatonov', 'Ustinov'] :
        ['Adventurer', 'Explorer', 'Navigator', 'Voyager', 'Mariner', 'Trader', 'Express'];
        
      const shipNumbers = ['I', 'II', 'III', 'IV', 'V', '1', '2', '3', '4', '5'];
      
      let name;
      if (Math.random() < 0.3) {
        // 30% chance of having a prefix-suffix name
        name = `${prefixes[Math.floor(Math.random() * prefixes.length)]} ${suffixes[Math.floor(Math.random() * suffixes.length)]}`;
      } else if (Math.random() < 0.5) {
        // 20% chance of having a name with a number
        name = `${prefixes[Math.floor(Math.random() * prefixes.length)]} ${shipNumbers[Math.floor(Math.random() * shipNumbers.length)]}`;
      } else {
        // 50% chance of having a simple prefix or suffix name
        name = Math.random() < 0.5 ? 
          prefixes[Math.floor(Math.random() * prefixes.length)] : 
          suffixes[Math.floor(Math.random() * suffixes.length)];
      }
      
      if (vesselType === 'military' && isRussian) {
        name = `RFS ${name}`; // Russian Federation Ship
      }
      
      // Calculate a detection probability
      const detectionProbability = {
        radar: Math.random(), // 0-1, higher means more visible on radar
        sonar: Math.random(), // 0-1, higher means more detectable by sonar
        fused: (Math.random() + Math.random()) / 2 // average of two values for a more normal distribution
      };
      
      // Generate a vessel object with all properties
      generatedVessels.push({
        id: placedVesselCount,
        name,
        type: vesselType,
        flag,
        isRussian,
        position,
        heading,
        speed,
        length,
        operator,
        detectionProbability,
        grossTonnage
      });
    }
    
    // More evenly disperse submarines too
    // Generate Russian submarines with special characteristics
    const submarineNames = [
      'Krasnodar', 'Novorossiysk', 'Rostov-on-Don', 'Stary Oskol', 
      'Velikiy Novgorod', 'Kolpino', 'Sankt Peterburg'
    ];
    
    const submarineClasses = [
      'Kilo-class', 'Kilo-class', 'Kilo-class', 'Kilo-class',
      'Improved Kilo-class', 'Improved Kilo-class', 'Lada-class'
    ];
    
    const submarineDesignations = [
      'B-265', 'B-261', 'B-237', 'B-262', 
      'B-268', 'B-271', 'B-585'
    ];
    
    // Use more strategic submarine positions
    const submarineAreas = [
      // Gulf of Finland approach - monitoring traffic to St. Petersburg
      [26.2, 59.7],
      // Near NATO naval exercise areas in central Baltic
      [19.3, 56.8],
      // Monitoring approach to Stockholm archipelago
      [18.9, 58.9],
      // Deep water between Gotland and Latvia (strategic position)
      [20.1, 57.3],
      // Patrolling near Kaliningrad naval base
      [19.6, 55.2],
      // Monitoring naval traffic near Gdańsk
      [18.8, 54.8],
      // Danish straits approaches - key strategic chokepoint
      [12.8, 55.4]
    ];
    
    // Add some randomness to submarine positions to avoid perfect predictability
    const randomizedSubmarineAreas = submarineAreas.map(pos => [
      pos[0] + (Math.random() - 0.5) * 0.5,  // Add up to ±0.25 degrees longitude
      pos[1] + (Math.random() - 0.5) * 0.3   // Add up to ±0.15 degrees latitude
    ]);
    
    // Add submarines to generated vessels
    for (let i = 0; i < 7; i++) {
      const position = randomizedSubmarineAreas[i];
      
      // Skip submarine positions that aren't in Baltic Sea water
      if (!isInBalticSeaWaters(position[1], position[0])) {
        // Try to find a better position by adjusting slightly
        for (let attempt = 0; attempt < 5; attempt++) {
          // Try adjusting position slightly to find water
          const adjustedPosition = [
            position[0] + (Math.random() - 0.5) * 0.5,
            position[1] + (Math.random() - 0.5) * 0.5
          ];
          
          if (isInBalticSeaWaters(adjustedPosition[1], adjustedPosition[0])) {
            // Found a valid position
            position[0] = adjustedPosition[0];
            position[1] = adjustedPosition[1];
            break;
          }
        }
        
        // If still not in water after adjustments, skip this submarine
        if (!isInBalticSeaWaters(position[1], position[0])) {
          continue;
        }
      }
      
      const heading = Math.floor(Math.random() * 360);
      const speed = 5 + Math.floor(Math.random() * 10); // Submarines move slower on average
      const depth = 20 + Math.floor(Math.random() * 180); // Depth in meters
      
      // Submarine detection characteristics
      // Low radar detection when submerged, high sonar signature
      const isSubmerged = Math.random() > 0.3; // 70% chance of being submerged
      
      const detectionProbability = {
        radar: isSubmerged ? 0.05 + Math.random() * 0.1 : 0.3 + Math.random() * 0.2, // Low radar when submerged
        sonar: 0.6 + Math.random() * 0.4, // High sonar signature
        fused: isSubmerged ? 
          (0.05 + Math.random() * 0.1 + 0.6 + Math.random() * 0.4) / 2 : // Average when submerged
          (0.3 + Math.random() * 0.2 + 0.6 + Math.random() * 0.4) / 2    // Average when surfaced
      };
      
      generatedVessels.push({
        id: 1001 + i, // IDs starting from 1001 for submarines
        name: `RFS ${submarineNames[i]}`,
        type: 'submarine',
        class: submarineClasses[i],
        designation: submarineDesignations[i],
        flag: 'Russia',
        isRussian: true,
        position,
        heading,
        speed,
        depth,
        length: 70 + Math.floor(Math.random() * 20), // Kilo-class submarines are around 70-74m
        isSubmerged,
        operator: 'Russian Navy',
        detectionProbability
      });
    }
    
    // Add Russian drones from Kaliningrad and St. Petersburg
    const droneStartingLocations = [
      [20.5, 54.7], // Kaliningrad
      [30.3, 59.9]  // St. Petersburg
    ];
    
    const droneNames = [
      'Orion-E', 'Orlan-10', 'Forpost-R', 'Altius-RU', 
      'Okhotnik', 'Grom', 'Kronshtadt', 'Sirius'
    ];
    
    // Define Baltic Sea safe water areas for drone starting positions
    const balticSeaSafeWaters = [
      // Central Baltic 
      {minLat: 55.0, maxLat: 60.0, minLng: 17.0, maxLng: 21.0},
      // Gulf of Finland
      {minLat: 59.0, maxLat: 60.5, minLng: 23.0, maxLng: 28.0},
      // Gulf of Riga
      {minLat: 57.0, maxLat: 59.0, minLng: 22.0, maxLng: 24.5},
      // Southern Baltic
      {minLat: 54.5, maxLat: 56.0, minLng: 14.0, maxLng: 20.0}
    ];
    
    // Helper function to check if a position is over water
    const isOverWater = (lat, lng) => {
      // Land areas to avoid
      const landAreas = [
        // Sweden mainland
        {minLat: 55.3, maxLat: 63.0, minLng: 11.5, maxLng: 17.0},
        // Finland mainland
        {minLat: 60.0, maxLat: 65.5, minLng: 21.0, maxLng: 30.0},
        // Estonia/Latvia/Lithuania mainland
        {minLat: 56.0, maxLat: 59.5, minLng: 23.0, maxLng: 28.0},
        // Poland mainland
        {minLat: 53.5, maxLat: 54.8, minLng: 14.5, maxLng: 19.5},
        // Denmark mainland
        {minLat: 54.5, maxLat: 57.8, minLng: 8.0, maxLng: 12.5}
      ];
      
      // Check if position is over land
      for (const area of landAreas) {
        if (lat >= area.minLat && lat <= area.maxLat && 
            lng >= area.minLng && lng <= area.maxLng) {
          return false; // Over land
        }
      }
      
      return true; // Not over land
    };
    
    // Generate 8 Russian drones (4 from each location)
    for (let i = 0; i < 8; i++) {
      const startLocation = droneStartingLocations[i % 2]; // Alternate between Kaliningrad and St. Petersburg
      
      // Select a safe water area
      const safeWaterArea = balticSeaSafeWaters[i % balticSeaSafeWaters.length];
      
      // Generate position within safe waters
      let position;
      let attempts = 0;
      
      do {
        if (i % 2 === 0) { // Kaliningrad drones
          // Move toward central/northern Baltic
          const offsetLng = (Math.random() * 4) - 3; // -3 to 1 longitude shift
          const offsetLat = (Math.random() * 4) + 1;  // 1 to 5 latitude shift (north)
          position = [startLocation[0] + offsetLng, startLocation[1] + offsetLat];
        } else { // St. Petersburg drones
          // Move toward central/western Baltic
          const offsetLng = (Math.random() * 6) - 8; // -8 to -2 longitude shift (west)
          const offsetLat = (Math.random() * 3) - 1.5; // -1.5 to 1.5 latitude shift
          position = [startLocation[0] + offsetLng, startLocation[1] + offsetLat];
        }
        
        // Fallback to safe water area after a few attempts
        if (attempts > 5) {
          const lngRange = safeWaterArea.maxLng - safeWaterArea.minLng;
          const latRange = safeWaterArea.maxLat - safeWaterArea.minLat;
          position = [
            safeWaterArea.minLng + Math.random() * lngRange,
            safeWaterArea.minLat + Math.random() * latRange
          ];
        }
        
        attempts++;
      } while (!isOverWater(position[1], position[0]) && attempts < 10);
      
      // Calculate heading based on destination (simplified)
      const dx = position[0] - startLocation[0];
      const dy = position[1] - startLocation[1];
      const heading = Math.atan2(dy, dx) * (180 / Math.PI);
      
      // Generate the drone object
      generatedVessels.push({
        id: 1000 + i, // Use ID range that won't conflict with regular vessels
        name: droneNames[i],
        type: 'drone',
        flag: 'Russia',
        isRussian: true,
        position, // Position over Baltic Sea
        heading: heading < 0 ? heading + 360 : heading,
        speed: 110, // 110 knots as requested
        length: 10 + Math.floor(Math.random() * 15), // Small size (10-25 meters)
        operator: 'Russian Military',
        detectionProbability: {
          radar: 0.3 + (Math.random() * 0.4), // Lower radar signature (0.3-0.7)
          sonar: 0,  // No sonar signature for drones
          fused: 0.3 + (Math.random() * 0.3) // Lower fused signature (0.3-0.6)
        },
        grossTonnage: 2 + Math.floor(Math.random() * 8) // Very small GT (2-10)
      });
    }
    
    return generatedVessels;
  }, []);
  
  // Generate vessel data when component mounts
  useEffect(() => {
    const simulatedVessels = generateVessels();
    
    // Process vessels - convert non-Russian flag but marked as Russian to military type
    // Also ensure any vessel with a Russian flag is properly marked as Russian
    const processedVessels = simulatedVessels.map(vessel => {
      // First case: Non-Russian flag but marked as Russian - convert to military
      if (vessel.isRussian && vessel.flag !== 'Russia' && vessel.type !== 'submarine' && vessel.type !== 'drone') {
        return {
          ...vessel,
          isRussian: false, // Remove Russian designation
          type: 'military', // Change to military type
          operator: vessel.operator // Keep the operator (which might be Russian)
        };
      }
      
      // Second case: Russian flag but not marked as Russian - ensure it's marked as Russian
      // This applies to all vessels with Russian flag, especially commercial and military
      if (vessel.flag === 'Russia' && !vessel.isRussian) {
        return {
          ...vessel,
          isRussian: true // Ensure it's properly marked as Russian
        };
      }
      
      // Third case: Russian flag commercial vessels - ensure they are marked as Russian Ships
      if (vessel.flag === 'Russia' && (vessel.type === 'commercial' || vessel.type === 'tanker')) {
        return {
          ...vessel,
          isRussian: true,
          type: 'russian' // Categorize as "Russian Ships"
        };
      }
      
      return vessel;
    });
    
    setVessels(processedVessels);
  }, [generateVessels]);
  
  // Update vessel positions based on speed and heading
  const updateVesselPositions = useCallback(() => {
    if (!simulationEnabled) return;
    
    const currentTime = Date.now();
    const deltaTime = (currentTime - lastUpdateTimeRef.current) / 1000; // Convert ms to seconds
    lastUpdateTimeRef.current = currentTime;
    
    // Apply speed multiplier to deltaTime
    const adjustedDeltaTime = deltaTime * simulationSpeed;
    
    // Skip if delta time is too large (e.g., browser tab was inactive)
    if (adjustedDeltaTime > 5) return;
    
    // Define areas to avoid (major land masses)
    const avoidAreas = [
      // Sweden mainland
      {minLat: 55.3, maxLat: 63.0, minLng: 11.5, maxLng: 17.0},
      // Finland mainland
      {minLat: 60.0, maxLat: 65.5, minLng: 21.0, maxLng: 30.0},
      // Estonia/Latvia/Lithuania mainland
      {minLat: 56.0, maxLat: 59.5, minLng: 23.0, maxLng: 28.0},
      // Poland mainland
      {minLat: 53.5, maxLat: 54.8, minLng: 14.5, maxLng: 19.5},
      // Denmark mainland
      {minLat: 54.5, maxLat: 57.8, minLng: 8.0, maxLng: 12.5}
    ];
    
    // Check for stuck/frozen drones or vessels
    const isStuck = (vessel) => {
      // A vessel is considered "stuck" if:
      // 1. It's a drone with a speed setting above 0 but is not moving
      // 2. It's over land or outside the Baltic Sea region
      if (vessel.type === 'drone' && vessel.speed > 0) {
        // Check if it's over land or outside region
        const isOverLand = avoidAreas.some(area => 
          vessel.position[1] >= area.minLat && vessel.position[1] <= area.maxLat && 
          vessel.position[0] >= area.minLng && vessel.position[0] <= area.maxLng
        );
        
        // Check if outside Baltic Sea region
        const isTooFarNorth = vessel.position[1] > 65.0;
        const isTooFarSouth = vessel.position[1] < 54.0;
        const isTooFarEast = vessel.position[0] > 30.0;
        const isTooFarWest = vessel.position[0] < 10.0;
        
        return isOverLand || isTooFarNorth || isTooFarSouth || isTooFarEast || isTooFarWest;
      }
      return false;
    };
    
    setVessels(prevVessels => {
      return prevVessels.map(vessel => {
        // Check if vessel is stuck first
        if (isStuck(vessel)) {
          // Calculate heading toward Baltic Sea center
          const centerLat = 58.0;
          const centerLng = 19.0;
          let newHeading = Math.atan2(centerLng - vessel.position[0], centerLat - vessel.position[1]) * 180 / Math.PI;
          if (newHeading < 0) newHeading += 360;
          
          // Calculate a new position moving toward Baltic Sea center
          const emergencyHeadingRad = newHeading * Math.PI / 180;
          const latAdjustment = Math.cos(vessel.position[1] * Math.PI / 180);
          const emergencyLngChange = vessel.speed * 0.0003 * adjustedDeltaTime / latAdjustment;
          const emergencyLatChange = vessel.speed * 0.0003 * adjustedDeltaTime;
          
          // Move toward Baltic Sea center
          const emergencyNewLng = vessel.position[0] + (emergencyLngChange * Math.sin(emergencyHeadingRad));
          const emergencyNewLat = vessel.position[1] + (emergencyLatChange * Math.cos(emergencyHeadingRad));
          
          return {
            ...vessel,
            position: [emergencyNewLng, emergencyNewLat],
            heading: newHeading
          };
        }
        
        // Skip stationary vessels
        if (vessel.speed === 0) return vessel;
        
        // Special handling for drones - higher altitude allows more direct movement
        if (vessel.type === 'drone') {
          // Convert knots to degrees per second - drones can move faster over land
          const droneLatAdjustment = Math.cos(vessel.position[1] * Math.PI / 180);
          const droneLngChange = vessel.speed * 0.0003 * adjustedDeltaTime / droneLatAdjustment;
          const droneLatChange = vessel.speed * 0.0003 * adjustedDeltaTime;
          
          // Calculate new position based on heading
          const droneHeadingRad = vessel.heading * Math.PI / 180;
          const droneNewLng = vessel.position[0] + (droneLngChange * Math.sin(droneHeadingRad));
          const droneNewLat = vessel.position[1] + (droneLatChange * Math.cos(droneHeadingRad));
          
          // Drones have different movement patterns - they patrol or move with purpose
          let newHeading = vessel.heading;
          
          // Occasional heading changes for drones - more purposeful than ships
          if (Math.random() < 0.03 * adjustedDeltaTime) {
            // Drones make sharper turns (up to +/- 45 degrees)
            newHeading = (vessel.heading + (Math.random() * 90 - 45)) % 360;
            if (newHeading < 0) newHeading += 360;
          }
          
          // Check if drone is going too far from Baltic Sea - if so, turn back
          const isTooFarNorth = droneNewLat > 65.0;
          const isTooFarSouth = droneNewLat < 54.0;
          const isTooFarEast = droneNewLng > 30.0;
          const isTooFarWest = droneNewLng < 10.0;
          
          // Define areas to avoid (major land masses)
          const avoidAreas = [
            // Sweden mainland
            {minLat: 55.3, maxLat: 63.0, minLng: 11.5, maxLng: 17.0},
            // Finland mainland
            {minLat: 60.0, maxLat: 65.5, minLng: 21.0, maxLng: 30.0},
            // Estonia/Latvia/Lithuania mainland
            {minLat: 56.0, maxLat: 59.5, minLng: 23.0, maxLng: 28.0},
            // Poland mainland
            {minLat: 53.5, maxLat: 54.8, minLng: 14.5, maxLng: 19.5},
            // Denmark mainland
            {minLat: 54.5, maxLat: 57.8, minLng: 8.0, maxLng: 12.5}
          ];
          
          // Check if drone is over major land area
          let isOverLand = false;
          for (const area of avoidAreas) {
            if (droneNewLat >= area.minLat && droneNewLat <= area.maxLat && 
                droneNewLng >= area.minLng && droneNewLng <= area.maxLng) {
              isOverLand = true;
              break;
            }
          }
          
          if (isTooFarNorth || isTooFarSouth || isTooFarEast || isTooFarWest || isOverLand) {
            // Calculate heading toward Baltic Sea center
            const centerLat = 58.0;
            const centerLng = 19.0;
            newHeading = Math.atan2(centerLng - vessel.position[0], centerLat - vessel.position[1]) * 180 / Math.PI;
            if (newHeading < 0) newHeading += 360;
            
            // Calculate a new position moving toward Baltic Sea center
            const emergencyHeadingRad = newHeading * Math.PI / 180;
            const emergencyLngChange = vessel.speed * 0.0003 * adjustedDeltaTime / droneLatAdjustment;
            const emergencyLatChange = vessel.speed * 0.0003 * adjustedDeltaTime;
            
            // Move drone toward Baltic Sea center
            const emergencyNewLng = vessel.position[0] + (emergencyLngChange * Math.sin(emergencyHeadingRad));
            const emergencyNewLat = vessel.position[1] + (emergencyLatChange * Math.cos(emergencyHeadingRad));
            
            // Make a more significant course correction if over land or outside boundaries
            return {
              ...vessel,
              position: [emergencyNewLng, emergencyNewLat],
              heading: newHeading
            };
          }
          
          // Ensure drones stay roughly within Baltic Sea region
          return {
            ...vessel,
            position: [droneNewLng, droneNewLat],
            heading: newHeading
          };
        }
        
        // Regular vessel movement (non-drone) - original code
        // Convert knots to degrees per second
        // 1 knot ≈ 0.0003 degrees of longitude at the equator per second
        // Adjust for latitude (narrower longitude degrees at higher latitudes)
        const latitudeAdjustment = Math.cos(vessel.position[1] * Math.PI / 180);
        const longitudeChange = vessel.speed * 0.0003 * adjustedDeltaTime / latitudeAdjustment;
        const latitudeChange = vessel.speed * 0.0003 * adjustedDeltaTime;
        
        // Calculate new position based on heading
        const headingRad = vessel.heading * Math.PI / 180;
        const newLng = vessel.position[0] + (longitudeChange * Math.sin(headingRad));
        const newLat = vessel.position[1] + (latitudeChange * Math.cos(headingRad));
        
        // Enhanced boundary checking to keep vessels within the actual Baltic Sea water
        if (!isInBalticSeaWaters(newLat, newLng)) {
          // If would move onto land or out of bounds, adjust heading to turn back toward deeper water
          // Use a more detailed approach to find the right direction
          
          // Try finding a better direction by checking multiple angles
          let bestHeading = vessel.heading;
          let foundBetterDirection = false;
          
          // Check 8 directions around to find waters
          for (let angleOffset = 0; angleOffset < 360; angleOffset += 45) {
            const testHeading = (vessel.heading + angleOffset) % 360;
            const testRad = testHeading * Math.PI / 180;
            
            // Check a position further out in this direction
            const testLng = vessel.position[0] + (longitudeChange * 5 * Math.sin(testRad));
            const testLat = vessel.position[1] + (latitudeChange * 5 * Math.cos(testRad));
            
            if (isInBalticSeaWaters(testLat, testLng)) {
              bestHeading = testHeading;
              foundBetterDirection = true;
              break;
            }
          }
          
          // If no good direction found, head toward the Baltic center
          if (!foundBetterDirection) {
            const centerLat = 58.5; // More centered in the main Baltic basin
            const centerLng = 20;   // Adjusted to be in deeper waters
            const angleToCenter = Math.atan2(centerLng - vessel.position[0], centerLat - vessel.position[1]) * 180 / Math.PI;
            
            // Turn gradually toward the center
            const headingDiff = ((angleToCenter - vessel.heading + 540) % 360) - 180;
            bestHeading = (vessel.heading + Math.sign(headingDiff) * 45) % 360;
            if (bestHeading < 0) bestHeading += 360;
          }
          
          // Slow down near boundaries
          const reducedSpeed = Math.max(1, vessel.speed * 0.5);
          
          return {
            ...vessel,
            heading: bestHeading,
            speed: reducedSpeed // Temporarily reduce speed when changing course
          };
        }
        
        // For military and submarine vessels, randomly change heading occasionally
        let newHeading = vessel.heading;
        const originalSpeed = vessel.speed;
        let newSpeed = originalSpeed;
        
        if ((vessel.type === 'military' || vessel.type === 'submarine') && Math.random() < 0.01 * adjustedDeltaTime) {
          // Change heading by up to +/- 30 degrees
          newHeading = (vessel.heading + (Math.random() * 60 - 30)) % 360;
          if (newHeading < 0) newHeading += 360;
          
          // Military vessels might change speed during maneuvers
          if (Math.random() < 0.3) {
            const speedFactor = 0.7 + Math.random() * 0.6; // 70-130% of current speed
            newSpeed = Math.max(1, Math.min(30, originalSpeed * speedFactor));
          }
        }
        // Smaller random heading changes for other vessels to simulate realistic movement
        else if (Math.random() < 0.005 * adjustedDeltaTime) {
          // Change heading by up to +/- 10 degrees
          newHeading = (vessel.heading + (Math.random() * 20 - 10)) % 360;
          if (newHeading < 0) newHeading += 360;
        }
        
        // Final position check - ensure vessel doesn't go on land even after all other checks
        const finalLng = newLng;
        const finalLat = newLat;
        
        // If vessel would end up on land, don't update position but keep the heading change
        if (!isInBalticSeaWaters(finalLat, finalLng)) {
          return {
            ...vessel,
            heading: newHeading,
            speed: newSpeed
          };
        }
        
        // Special check for Swedish coastline (which seems particularly problematic)
        // These bounds roughly define the Swedish coastline area
        const isNearSwedishCoast = (
          (finalLat >= 55.0 && finalLat <= 60.0 && finalLng >= 12.0 && finalLng <= 19.0) &&
          // Distance to coast is small
          ((finalLng >= 12.0 && finalLng <= 14.0) || // Western coast
           (finalLat >= 58.0 && finalLat <= 60.0 && finalLng >= 16.5 && finalLng <= 19.0) || // Stockholm area
           (finalLat >= 56.0 && finalLat <= 58.0 && finalLng >= 15.5 && finalLng <= 17.0)) // Eastern coast
        );
        
        // For vessels near Swedish coast, make extra check by testing multiple points
        if (isNearSwedishCoast && Math.random() < 0.7) { // 70% extra caution near Swedish coast
          const currentPos = vessel.position;
          const distance = Math.sqrt(
            Math.pow(finalLng - currentPos[0], 2) + 
            Math.pow(finalLat - currentPos[1], 2)
          );
          
          // If making a significant move near Swedish coast, stay put instead of risking land
          if (distance > 0.02) {
            return {
              ...vessel,
              heading: newHeading,
              speed: Math.max(1, newSpeed * 0.5) // Reduce speed near coast
            };
          }
        }
        
        return {
          ...vessel,
          position: [finalLng, finalLat],
          heading: newHeading,
          speed: newSpeed
        };
      });
    });
    
    // Request next animation frame
    animationFrameRef.current = requestAnimationFrame(updateVesselPositions);
  }, [simulationEnabled, simulationSpeed]);
  
  // Function to check if a point is in Baltic Sea waters
  // This is a more precise check than just the bounding box
  const isInBalticSeaWaters = useCallback((lat, lng) => {
    // First check overall bounds
    if (lat < 54.0 || lat > 66.0 || lng < 9.0 || lng > 30.0) {
      return false;
    }
    
    // Define areas that are land (to be avoided)
    // Format: [south, north, west, east]
    const landAreas = [
      // Southern Sweden - expanded and more precise with additional coverage
      [55.0, 59.5, 12.5, 16.0],
      // Southern Sweden - additional western coast coverage
      [56.0, 58.8, 11.5, 13.0],
      // Stockholm archipelago area - more precise
      [59.0, 60.0, 17.0, 19.2],
      // Sweden central eastern coast - additional coverage
      [58.0, 59.5, 16.0, 17.8],
      // Northern Sweden - Gulf of Bothnia coastline
      [60.0, 63.0, 17.0, 19.5],
      // Northern Sweden - upper Gulf of Bothnia
      [63.0, 65.5, 17.0, 22.0],
      // Northern Sweden - northwestern area
      [64.0, 66.0, 15.0, 17.0],
      // Finland - expanded
      [59.7, 65.5, 21.0, 30.0],
      // Estonia - expanded
      [57.5, 59.7, 22.8, 28.5],
      // Latvia/Lithuania coast - expanded
      [55.5, 57.5, 20.8, 28.0],
      // Poland inland - expanded
      [54.0, 55.5, 14.8, 19.8],
      // Germany/Denmark inland - expanded
      [54.0, 56.5, 9.0, 12.0],
      // Gotland - more precise
      [56.8, 58.0, 18.0, 19.2],
      // Åland Islands - expanded
      [59.7, 60.5, 19.3, 21.3],
      // Bornholm - more precise
      [54.9, 55.3, 14.7, 15.2],
      // Öland
      [56.1, 57.5, 16.3, 17.1],
      // Rügen
      [54.2, 54.7, 13.0, 13.6],
      // Saaremaa
      [57.8, 58.7, 21.7, 23.0],
      // Hiiumaa
      [58.7, 59.1, 22.0, 23.0],
      // Inland lakes in Finland
      [61.0, 63.0, 25.0, 30.0],
      // Kaliningrad and surrounding area
      [54.3, 55.3, 19.6, 22.5]
    ];
    
    // Define key shipping channels and deep waters (preferred areas)
    // Format: [south, north, west, east, weight]
    const shippingChannels = [
      // Main Baltic basin
      [55.5, 59.0, 16.5, 22.0, 10],
      // Gulf of Finland shipping lane
      [59.3, 60.2, 22.5, 28.0, 8],
      // Approach to Stockholm
      [58.7, 59.5, 17.5, 19.5, 6],
      // Approach to Riga
      [56.8, 58.0, 22.5, 24.5, 6],
      // Approach to Helsinki/Tallinn
      [59.2, 59.9, 24.0, 25.5, 8],
      // Western Baltic shipping lane
      [54.5, 56.0, 12.0, 15.0, 8],
      // Kattegat
      [56.0, 57.5, 10.5, 12.0, 6],
      // Gulf of Bothnia
      [60.5, 63.5, 18.5, 21.5, 5],
      // Central Baltic - expanded to cover more water
      [56.0, 59.0, 17.5, 21.0, 10],
      // Southern Baltic - expanded
      [54.5, 56.5, 15.0, 19.0, 8]
    ];
    
    // Check if point is in a land area - more strict checking
    for (const [south, north, west, east] of landAreas) {
      if (lat >= south && lat <= north && lng >= west && lng <= east) {
        // Further check for complex coastlines
        // This is a very simplified approach - we add some randomness 
        // to prevent vessels from getting stuck at sharp boundary transitions
        
        // If near the edge of a land area, there's a small chance to still consider it water
        // This helps vessels navigate around complex coastlines without getting stuck
        const distanceFromEdge = Math.min(
          Math.abs(lat - south),
          Math.abs(lat - north),
          Math.abs(lng - west),
          Math.abs(lng - east)
        );
        
        // Very close to edge - might be a complex coastline
        if (distanceFromEdge < 0.1) {
          // 15% chance to consider it water if very close to edge (reduced from 20%)
          // This randomness helps prevent getting stuck at boundaries
          return Math.random() < 0.15;
        }
        
        return false; // It's in a land area
      }
    }

    // Check if in a preferred shipping channel
    for (const [south, north, west, east] of shippingChannels) {
      if (lat >= south && lat <= north && lng >= west && lng <= east) {
        return true; // In a shipping channel - definitely good
      }
    }
    
    // For areas not explicitly defined, use the following general rules
    
    // Avoid shallow coastal waters (simplified approach)
    // These are general buffer zones around landmasses
    const coastalBuffers = [
      // Swedish coast buffer - expanded
      [55.0, 59.5, 14.8, 16.5],
      // Swedish west coast buffer
      [56.0, 58.8, 11.0, 12.2],
      // Swedish eastern coastline
      [58.0, 59.5, 16.0, 17.0],
      // Northern Sweden - Gulf of Bothnia western coast
      [60.0, 63.0, 19.0, 20.0],
      // Northern Sweden - upper coast
      [63.0, 65.5, 19.5, 22.5],
      // Finnish coast buffer
      [59.7, 65.5, 20.0, 21.5],
      // Estonian coast buffer
      [57.5, 59.7, 22.0, 23.0],
      // Latvian/Lithuanian coast buffer
      [55.5, 57.5, 19.5, 21.5],
      // Polish coast buffer
      [54.0, 55.5, 14.0, 15.5],
      // German/Danish coast buffer
      [54.0, 56.0, 12.0, 13.0]
    ];
    
    // Check coastal buffers with higher probability of rejection
    for (const [south, north, west, east] of coastalBuffers) {
      if (lat >= south && lat <= north && lng >= west && lng <= east) {
        // 80% chance to consider coastal buffers as land (increased from 70%)
        return Math.random() > 0.8;
      }
    }
    
    // Special check for Swedish coastal waters - these are problematic
    const swedishProblemAreas = [
      // Stockholm archipelago approaches
      [58.8, 59.5, 17.5, 19.0],
      // Swedish eastern coastline near Öland
      [56.5, 57.5, 16.0, 16.8],
      // Swedish western approaches
      [57.0, 58.5, 11.2, 12.5],
      // Northern Sweden Gulf of Bothnia western coast
      [60.0, 63.0, 18.5, 20.0],
      // Northern Sweden - northeastern area
      [63.0, 65.0, 19.0, 22.0]
    ];
    
    // Higher rejection rate specifically for Swedish coastal waters
    for (const [south, north, west, east] of swedishProblemAreas) {
      if (lat >= south && lat <= north && lng >= west && lng <= east) {
        // 90% chance to reject - very strict for Swedish waters
        return Math.random() > 0.9;
      }
    }
    
    // Additional check for enclosed bays and lakes
    // Define problematic enclosed areas (small bays, inlets, etc.)
    const problematicAreas = [
      // Finnish inland lake areas 
      [60.7, 62.5, 23.0, 29.0],
      // Swedish lake areas
      [58.5, 59.5, 14.0, 16.0],
      // Various small bays and inlets
      [57.2, 57.6, 16.8, 17.2], // Near Öland
      [60.0, 60.2, 24.8, 25.2], // Helsinki area
      [58.8, 59.0, 17.5, 18.0], // Stockholm archipelago
      [58.1, 58.5, 11.5, 12.0]  // Skagerrak entrance
    ];
    
    // Higher chance to reject problematic areas
    for (const [south, north, west, east] of problematicAreas) {
      if (lat >= south && lat <= north && lng >= west && lng <= east) {
        // 60% chance to reject
        return Math.random() > 0.6;
      }
    }
    
    // Explicitly define major lakes to avoid them completely
    const majorLakes = [
      // Swedish lakes
      [58.0, 59.3, 12.3, 14.0], // Vänern
      [57.7, 58.7, 14.0, 14.8], // Vättern
      [59.1, 59.7, 15.8, 18.0], // Mälaren
      [56.9, 57.5, 13.4, 14.8], // Southern Swedish lakes
      [56.8, 57.2, 14.4, 15.2], // Åsnen and nearby lakes
      
      // Finnish lakes
      [61.0, 62.3, 24.5, 26.4], // Päijänne and nearby
      [61.3, 63.1, 26.5, 29.0], // Saimaa system
      [62.0, 63.7, 23.0, 24.5], // Western Finnish lakes
      [61.5, 62.2, 28.5, 29.8], // Eastern Finnish lakes
      [60.3, 60.8, 23.5, 25.0], // Southern Finnish lakes
      
      // Russian lakes
      [60.0, 61.8, 29.2, 32.0], // Ladoga
      [60.0, 60.8, 27.4, 29.0], // Eastern Gulf of Finland lakes
      [57.8, 59.0, 26.5, 28.5], // Peipus
      
      // Other inland waters
      [54.1, 54.7, 17.8, 18.7], // Polish lakes
      [53.5, 54.3, 12.0, 14.0], // German lakes
      [53.8, 55.0, 10.2, 11.0], // Danish inland waters
      [55.5, 56.5, 9.5, 10.2]   // Limfjord area
    ];
    
    // Strict rejection of major lakes - almost never allow vessels here
    for (const [south, north, west, east] of majorLakes) {
      if (lat >= south && lat <= north && lng >= west && lng <= east) {
        // 99.5% chance to consider these as land - essentially never allow vessels in lakes
        return Math.random() > 0.995;
      }
    }
    
    // Known safe water zones - replaced with enhanced version
    const safeWaterZones = [
      // Central Baltic open water
      [56.5, 58.5, 18.0, 21.0],
      // Eastern Baltic open water
      [57.0, 59.0, 20.0, 22.0],
      // Western Baltic open water
      [55.0, 56.5, 13.0, 15.0],
      // Southern Baltic deep water
      [54.5, 55.5, 16.0, 18.5],
      // Gulf of Finland central channel
      [59.4, 60.0, 23.0, 27.0],
      // Gulf of Bothnia southern part - central channel
      [60.5, 62.5, 20.0, 21.0],
      // Gulf of Bothnia central part - central channel
      [62.5, 64.0, 20.2, 21.2],
      // Gulf of Bothnia northern part - central channel
      [64.0, 65.0, 21.5, 22.5]
    ];
    
    // If in a known safe water zone, it's definitely water
    for (const [south, north, west, east] of safeWaterZones) {
      if (lat >= south && lat <= north && lng >= west && lng <= east) {
        return true;
      }
    }
    
    // Special check for northern Gulf of Bothnia - narrower channel
    if (lat >= 63.0 && lat <= 65.5 && lng >= 20.0 && lng <= 22.0) {
      // In the narrower northern part of Gulf of Bothnia, be more restrictive
      // Only consider central waters as safe (within 0.3° from center line)
      const centerLng = 21.0;
      const distanceFromCenter = Math.abs(lng - centerLng);
      
      if (distanceFromCenter < 0.3) {
        return true; // Central channel
      } else if (distanceFromCenter < 0.5) {
        // In the transition zone, random chance to allow
        return Math.random() > 0.7;
      } else {
        // Too close to shore
        return Math.random() > 0.95; // Very small chance to consider as water
      }
    }
    
    // If we got here, it's probably in open water
    return true;
  }, []);
  
  // Start/stop vessel position updates when simulation state changes
  useEffect(() => {
    if (simulationEnabled) {
      lastUpdateTimeRef.current = Date.now();
      animationFrameRef.current = requestAnimationFrame(updateVesselPositions);
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    // Cleanup when component unmounts
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [simulationEnabled, updateVesselPositions]);
  
  // Function to check if an item is in the current map bounds
  const isInMapBounds = useCallback((lat, lng) => {
    if (!mapBounds) return true; // If no bounds yet, show everything
    
    // Add buffer to avoid popping at edges
    const buffer = 0.5; // Buffer in degrees
    
    return (
      lat >= mapBounds.south - buffer &&
      lat <= mapBounds.north + buffer &&
      lng >= mapBounds.west - buffer &&
      lng <= mapBounds.east + buffer
    );
  }, [mapBounds]);
  
  // Function to render vessels based on the display mode and zoom level
  const renderVessels = useCallback(() => {
    // Use zoom level to determine detail level
    const isHighDetail = currentZoom >= 8;
    const isMediumDetail = currentZoom >= 6 && currentZoom < 8;
    const isLowDetail = currentZoom < 6;
    
    // Filter vessels based on current filters and map bounds
    const filteredVessels = vessels.filter(v => {
      // Apply user filters - if 'all' is selected or any specific filter matches
      let matchesFilter = filters.all;
      
      if (!matchesFilter) {
        if (filters.commercial && (v.type === 'commercial' || v.type === 'passenger' || v.type === 'tanker')) matchesFilter = true;
        if (filters.military && v.type === 'military') matchesFilter = true;
        if (filters.submarine && v.type === 'submarine') matchesFilter = true;
        if (filters.drone && v.type === 'drone') matchesFilter = true;
        // Show Russian ships except submarines and drones when "Russian Ships" is toggled
        if (filters.russian && v.isRussian && v.type !== 'submarine' && v.type !== 'drone') matchesFilter = true;
      }
      
      // Then check if in current map bounds
      const inBounds = isInMapBounds(v.position[1], v.position[0]);
      
      return matchesFilter && inBounds;
    });
    
    // Create vessel markers
    return filteredVessels.map(vessel => {
      // Convert vessel position to LatLng
      const position = { lat: vessel.position[1], lng: vessel.position[0] };
      const isSelected = selectedVessel?.id === vessel.id;
      
      // Define icon and visualization based on display mode and zoom level
      let iconProps = {};
      let circleProps = { radius: 0 };
    
      switch(displayMode) {
        case 'radar':
          // Radar mode - shows vessels as dots with direction indicators
          const radarOpacity = vessel.type === 'submarine' && vessel.isSubmerged ? 
            0.1 + vessel.detectionProbability.radar * 0.2 : 
            0.3 + vessel.detectionProbability.radar * 0.7;
          
          const radarScale = vessel.type === 'submarine' ? 
            vessel.isSubmerged ? 0.5 : 0.8 : 
            Math.max(0.6, Math.min(1.2, 0.6 + vessel.length / 300));
          
          // Special color for drones - bright red
          const radarColor = vessel.type === 'drone' ? 
            'rgb(255, 50, 50)' : 
            vessel.type === 'submarine' ? 
              'rgb(255, 0, 0)' : 
              vessel.isRussian ? 'rgb(231, 76, 60)' : 'rgb(52, 152, 219)';
          
          // Special handling for Russian submarines with oval shape and double size
          if (vessel.type === 'submarine' && vessel.isRussian) {
            // Reduce the size to a third of the previous size
            iconProps = {
              path: "M -5,0 a 5,2.5 0 1,0 10,0 a 5,2.5 0 1,0 -10,0", // Oval shape (reduced to 1/3 size)
              fillColor: 'rgb(255, 0, 0)',
              fillOpacity: 0.8,
              strokeColor: '#FFFFFF',
              strokeWeight: 1,
              rotation: vessel.speed > 1 ? vessel.heading : 0, // Only rotate if speed > 1 knot
              scale: 1,
              anchor: new window.google.maps.Point(0, 0),
            };
          } 
          else if (isLowDetail) {
            // Simple dots for low detail level
            if (vessel.type === 'drone') {
              // Special drone icon at low zoom - rhombus shape
              iconProps = {
                path: 'M 0,-4 8,0 0,10 -8,0 z', // Rhombus shape (stretched diamond)
                fillColor: radarColor,
                fillOpacity: 0.9, // More visible
                strokeColor: '#FFFFFF',
                strokeWeight: 1,
                scale: 0.8,
                rotation: vessel.heading,
                anchor: new window.google.maps.Point(0, 0),
              };
            } else {
              // Determine scale - increase Russian ships and submarines by 50%
              let baseScale = vessel.type === 'submarine' ? 3 : 2;
              // Apply 50% size increase for Russian ships and submarines
              if (vessel.isRussian || vessel.type === 'submarine') {
                baseScale *= 1.5;
              }
              
              iconProps = {
                path: window.google.maps.SymbolPath.CIRCLE,
                fillColor: radarColor,
                fillOpacity: radarOpacity,
                strokeColor: '#FFFFFF',
                strokeWeight: 1,
                scale: baseScale,
                anchor: new window.google.maps.Point(0, 0),
              };
            }
          } else if (isMediumDetail) {
            // Simplified arrow for medium detail
            if (vessel.type === 'drone') {
              // Custom drone icon for medium zoom
              iconProps = {
                path: 'M 0,-5 10,0 0,12 -10,0 z', // Rhombus shape (stretched diamond)
                fillColor: radarColor,
                fillOpacity: 0.9,
                strokeColor: '#FFFFFF',
                strokeWeight: 1,
                rotation: vessel.heading,
                scale: 0.9,
                anchor: new window.google.maps.Point(0, 0),
              };
            } else {
              // Increase arrow size for Russian ships and submarines by 50%
              let sizeMultiplier = (vessel.isRussian || vessel.type === 'submarine') ? 1.5 : 1.0;
              const arrowSize = radarScale * 4 * sizeMultiplier;
              
              iconProps = {
                path: `M 0,-${arrowSize} L ${arrowSize/2},${arrowSize} L -${arrowSize/2},${arrowSize} Z`, // Simpler arrow shape
                fillColor: radarColor,
                fillOpacity: radarOpacity,
                strokeColor: '#FFFFFF',
                strokeWeight: 1,
                rotation: vessel.speed > 1 ? vessel.heading : 0, // Only rotate if speed > 1 knot
                scale: 1,
                anchor: new window.google.maps.Point(0, 0),
              };
            }
          } else {
            // Full detail for high zoom levels
            if (vessel.type === 'drone') {
              // Detailed drone icon for high zoom
              iconProps = {
                path: 'M 0,-6 12,0 0,15 -12,0 z', // Rhombus shape (stretched diamond)
                fillColor: radarColor,
                fillOpacity: 0.9,
                strokeColor: '#FFFFFF',
                strokeWeight: 1.5,
                rotation: vessel.heading,
                scale: 1,
                anchor: new window.google.maps.Point(0, 0),
              };
              
              // Add a small "drone trail" circle for high detail
              const trailRadius = 300; // 300m trail
              circleProps = {
                radius: trailRadius,
                options: {
                  fillColor: radarColor,
                  fillOpacity: 0.1,
                  strokeColor: radarColor,
                  strokeOpacity: 0.3,
                  strokeWeight: 1,
                }
              };
            } else {
              // Increase arrow size for Russian ships and submarines by 50%
              let sizeMultiplier = (vessel.isRussian || vessel.type === 'submarine') ? 1.5 : 1.0;
              const arrowSize = radarScale * 5 * sizeMultiplier;
              
              iconProps = {
                path: `M 0,-${arrowSize} L ${arrowSize/2},${arrowSize} L 0,${arrowSize/2} L -${arrowSize/2},${arrowSize} Z`, // Arrow shape
                fillColor: radarColor,
                fillOpacity: radarOpacity,
                strokeColor: '#FFFFFF',
                strokeWeight: 1,
                rotation: vessel.speed > 1 ? vessel.heading : 0, // Only rotate if speed > 1 knot
                scale: 1,
                anchor: new window.google.maps.Point(0, 0),
              };
            }
          }
          break;
          
        default:
          // Default to radar mode with arrow icon
          const defaultSize = vessel.type === 'submarine' || vessel.isRussian ? 7.5 : 5; // 50% increase for Russian ships and submarines
          iconProps = {
            path: `M 0,-${defaultSize} L ${defaultSize/2},${defaultSize} L 0,${defaultSize/2} L -${defaultSize/2},${defaultSize} Z`, // Arrow shape
            fillColor: '#FFFFFF',
            fillOpacity: 0.8,
            strokeColor: '#000000',
            strokeWeight: 1,
            rotation: vessel.speed > 1 ? vessel.heading : 0, // Only rotate if speed > 1 knot
            scale: 1,
            anchor: new window.google.maps.Point(0, 0),
          };
          break;
      }

      return (
        <React.Fragment key={vessel.id}>
          <MemoizedMarker
            position={position}
            icon={iconProps}
            onClick={(e) => {
              // Prevent event propagation to the map
              if (e && e.domEvent) {
                e.domEvent.stopPropagation();
              }
              
              // Don't immediately close the tooltip if we're clicking on a vessel
              e && e.stop && e.stop();
              
              // Log complete vessel data for debugging
              console.log("Vessel clicked - Raw data:", JSON.stringify(vessel));
              
              // Create a complete copy of the vessel to ensure React detects the state change
              const vesselCopy = JSON.parse(JSON.stringify(vessel));
              
              // Immediately set selected vessel without delay
              setSelectedVessel(vesselCopy);
            }}
            zIndex={isSelected ? 1000 : vessel.type === 'submarine' ? 500 : 100}
          />
          
          
          {circleProps.radius > 0 && (
            <MemoizedCircle
              center={position}
              radius={circleProps.radius}
              options={circleProps.options}
            />
          )}
          
          {vessel.type === 'submarine' && vessel.isSubmerged && isHighDetail && (
            <MemoizedMarker
              position={{
                lat: position.lat + 0.03,
                lng: position.lng + 0.03
              }}
              label={{
                text: `${vessel.depth}m`,
                color: '#FFFFFF',
                fontSize: '8px',
                fontWeight: 'bold'
              }}
              icon={{
                path: 0, // CIRCLE
                scale: 0,
                fillOpacity: 0,
                strokeOpacity: 0
              }}
            />
          )}
        </React.Fragment>
      );
    });
  }, [vessels, filters, isInMapBounds, displayMode, currentZoom, selectedVessel]);
  
  // Baltic Sea wind farm data - expanded with EMODnet data
  const windFarmsData = [
    // Denmark
    { 
      name: "Kriegers Flak", 
      country: "Denmark", 
      capacity: 604, 
      lat: 54.9833, 
      lng: 13.0333, 
      status: "operational",
      turbines: 72,
      area: 132, // km²
      areaPoints: [
        {lat: 54.9633, lng: 13.0133},
        {lat: 54.9733, lng: 13.0533},
        {lat: 55.0033, lng: 13.0533},
        {lat: 55.0033, lng: 13.0133},
        {lat: 54.9833, lng: 12.9933},
        {lat: 54.9633, lng: 13.0133}
      ]
    },
    { 
      name: "Middelgrunden", 
      country: "Denmark", 
      capacity: 40, 
      lat: 55.6853, 
      lng: 12.6913, 
      status: "operational",
      turbines: 20,
      area: 4, // km²
      areaPoints: [
        {lat: 55.6903, lng: 12.6813},
        {lat: 55.6903, lng: 12.7013},
        {lat: 55.6803, lng: 12.7013},
        {lat: 55.6803, lng: 12.6813},
        {lat: 55.6903, lng: 12.6813}
      ]
    },
    { 
      name: "Rødsand I", 
      country: "Denmark", 
      capacity: 166, 
      lat: 54.5508, 
      lng: 11.7083, 
      status: "operational",
      turbines: 72,
      area: 35, // km²
      areaPoints: [
        {lat: 54.5408, lng: 11.6883},
        {lat: 54.5408, lng: 11.7283},
        {lat: 54.5608, lng: 11.7283},
        {lat: 54.5608, lng: 11.6883},
        {lat: 54.5408, lng: 11.6883}
      ]
    },
    { name: "Rødsand II", country: "Denmark", capacity: 207, lat: 54.5580, lng: 11.6170, status: "operational", turbines: 90, area: 40 },
    { name: "Anholt", country: "Denmark", capacity: 400, lat: 56.6000, lng: 11.2097, status: "operational", turbines: 111, area: 88 },
    { name: "Sprogø", country: "Denmark", capacity: 21, lat: 55.3414, lng: 10.9767, status: "operational", turbines: 7, area: 6 },
    { name: "Samsø", country: "Denmark", capacity: 23, lat: 55.7194, lng: 10.5639, status: "operational", turbines: 10, area: 5 },
    
    // Sweden
    { name: "Karehamn", country: "Sweden", capacity: 48, lat: 56.9750, lng: 17.0000, status: "operational", turbines: 16, area: 8 },
    { name: "Lillgrund", country: "Sweden", capacity: 110, lat: 55.5000, lng: 12.7667, status: "operational", turbines: 48, area: 6 },
    { name: "Södra Midsjöbanken", country: "Sweden", capacity: 1500, lat: 55.7500, lng: 17.4000, status: "planned", turbines: 170, area: 265 },
    { name: "Storgrundet", country: "Sweden", capacity: 265, lat: 61.1532, lng: 17.4376, status: "planned", turbines: 70, area: 57 },
    { name: "Utgrunden", country: "Sweden", capacity: 10.5, lat: 56.3350, lng: 16.2860, status: "operational", turbines: 7, area: 2 },
    { name: "Bockstigen", country: "Sweden", capacity: 2.5, lat: 57.0389, lng: 18.1378, status: "operational", turbines: 5, area: 1 },
    
    // Germany
    { name: "EnBW Baltic 1", country: "Germany", capacity: 48, lat: 54.6080, lng: 12.6520, status: "operational", turbines: 21, area: 7 },
    { name: "EnBW Baltic 2", country: "Germany", capacity: 288, lat: 54.9900, lng: 13.1666, status: "operational", turbines: 80, area: 27 },
    { name: "Arkona", country: "Germany", capacity: 385, lat: 54.7833, lng: 14.1000, status: "operational", turbines: 60, area: 39 },
    { name: "Wikinger", country: "Germany", capacity: 350, lat: 54.8333, lng: 14.0750, status: "operational", turbines: 70, area: 34 },
    { name: "Arcadis Ost 1", country: "Germany", capacity: 257, lat: 54.8333, lng: 13.7500, status: "under construction", turbines: 27, area: 30 },
    { name: "Gennaker", country: "Germany", capacity: 927, lat: 54.5500, lng: 12.2500, status: "planned", turbines: 103, area: 176 },
    { name: "Nordlicher Grund", country: "Germany", capacity: 630, lat: 54.9831, lng: 6.3582, status: "planned", turbines: 64, area: 57 },
    { name: "Ostseeschatz", country: "Germany", capacity: 372, lat: 54.3660, lng: 11.9165, status: "planned", turbines: 62, area: 40 },
    { name: "Baltic Eagle", country: "Germany", capacity: 476, lat: 54.7778, lng: 13.9239, status: "under construction", turbines: 50, area: 40 },
    
    // Finland
    { name: "Tahkoluoto", country: "Finland", capacity: 42, lat: 61.6330, lng: 21.3830, status: "operational", turbines: 10, area: 15 },
    { name: "Ajos", country: "Finland", capacity: 42, lat: 65.7166, lng: 24.5166, status: "operational", turbines: 13, area: 10 },
    { name: "Kemi Ajos I", country: "Finland", capacity: 15, lat: 65.6405, lng: 24.5267, status: "operational", turbines: 5, area: 6 },
    { name: "Kemi Ajos II", country: "Finland", capacity: 16, lat: 65.6563, lng: 24.5402, status: "operational", turbines: 3, area: 4 },
    { name: "Raahe", country: "Finland", capacity: 44, lat: 64.6500, lng: 24.3500, status: "planned", turbines: 8, area: 15 },
    { name: "Korsnäs", country: "Finland", capacity: 1300, lat: 62.7500, lng: 21.0500, status: "planned", turbines: 70, area: 175 },
    { name: "Siikajoki", country: "Finland", capacity: 100, lat: 64.8167, lng: 24.6167, status: "planned", turbines: 20, area: 25 },
    
    // Poland
    { name: "Baltic Power", country: "Poland", capacity: 1200, lat: 55.0000, lng: 18.3330, status: "under construction", turbines: 76, area: 131 },
    { name: "FEW Baltic II", country: "Poland", capacity: 350, lat: 54.8000, lng: 16.5000, status: "planned", turbines: 37, area: 41 },
    { name: "Baltica 1", country: "Poland", capacity: 896, lat: 55.2060, lng: 17.1633, status: "planned", turbines: 64, area: 108 },
    { name: "Baltica 2", country: "Poland", capacity: 1498, lat: 55.3340, lng: 16.8630, status: "planned", turbines: 107, area: 190 },
    { name: "Baltica 3", country: "Poland", capacity: 1045, lat: 55.3340, lng: 16.7000, status: "planned", turbines: 95, area: 131 },
    { name: "MFW Bałtyk I", country: "Poland", capacity: 1560, lat: 55.2383, lng: 17.4633, status: "planned", turbines: 100, area: 128 },
    { name: "MFW Bałtyk II", country: "Poland", capacity: 720, lat: 55.1233, lng: 17.2467, status: "planned", turbines: 60, area: 65 },
    { name: "MFW Bałtyk III", country: "Poland", capacity: 720, lat: 55.0817, lng: 17.0667, status: "planned", turbines: 60, area: 80 },
    
    // Estonia
    { 
      name: "Estonia Offshore 1", 
      country: "Estonia", 
      capacity: 1000, 
      lat: 58.8000, 
      lng: 22.0000, 
      status: "planned",
      turbines: 115,
      area: 230, // km²
      areaPoints: [
        {lat: 58.7800, lng: 21.9600},
        {lat: 58.7800, lng: 22.0400},
        {lat: 58.8200, lng: 22.0400},
        {lat: 58.8200, lng: 21.9600},
        {lat: 58.7800, lng: 21.9600}
      ]
    },
    { name: "Liivi", country: "Estonia", capacity: 1000, lat: 57.8333, lng: 23.5000, status: "planned", turbines: 100, area: 160 },
    { name: "Hiiumaa", country: "Estonia", capacity: 700, lat: 59.0833, lng: 22.3833, status: "planned", turbines: 70, area: 100 },
    { name: "Saare-Liivi", country: "Estonia", capacity: 600, lat: 57.9500, lng: 22.6833, status: "planned", turbines: 60, area: 90 },
    
    // Latvia
    { name: "ELWIND", country: "Latvia", capacity: 1000, lat: 57.0830, lng: 20.7500, status: "planned", turbines: 100, area: 200 },
    
    // Lithuania
    { name: "Lithuanian OWF I", country: "Lithuania", capacity: 700, lat: 55.8330, lng: 20.5000, status: "planned", turbines: 70, area: 120 },
    
    // Special projects
    { 
      name: "Bornholm Energy Island", 
      country: "Denmark", 
      capacity: 3000, 
      lat: 55.1000, 
      lng: 14.9000, 
      status: "planned",
      turbines: 200,
      area: 400, // km²
      areaPoints: [
        {lat: 55.0500, lng: 14.8500},
        {lat: 55.0500, lng: 14.9500},
        {lat: 55.1500, lng: 14.9500},
        {lat: 55.1500, lng: 14.8500},
        {lat: 55.0500, lng: 14.8500}
      ]
    },
    { name: "Hywind Tampen", country: "Norway", capacity: 88, lat: 61.2500, lng: 20.4000, status: "operational", turbines: 11, area: 22 }
  ];
  
  // Function to render wind farms on the map - enhanced with polygon areas and zoom-based detail
  const renderWindFarms = useCallback(() => {
    if (!showWindFarms) return null;
    
    // Filter wind farms to only show those in current map bounds
    const visibleWindFarms = windFarmsData.filter(farm => 
      isInMapBounds(farm.lat, farm.lng)
    );
    
    const isHighDetail = currentZoom >= 8;
    const isMediumDetail = currentZoom >= 6 && currentZoom < 8;
    
    return visibleWindFarms
      .map(windFarm => {
        const position = { lat: windFarm.lat, lng: windFarm.lng };
        
        // Use different colors based on wind farm status
        const fillColor = windFarm.status === "operational" 
          ? '#FFC107' // amber color for operational wind farms
          : '#4CAF50'; // green color for planned and under construction
        
        // Icon for wind farms
        const windFarmIcon = {
          path: "M -2,-2 L 2,-2 L 2,2 L -2,2 Z", // Square shape
          scale: 1.5,
          fillColor: fillColor,
          fillOpacity: 0.8,
          strokeColor: '#FFFFFF',
          strokeWeight: 1,
          rotation: 45, // Diamond shape
        };
        
        // Determine how to visualize the area based on zoom level
        let areaVisualization;
        
        if (isHighDetail) {
          // Full detail at high zoom
          if (windFarm.areaPoints) {
            // Use specific polygon points if available
            areaVisualization = (
              <MemoizedPolygon
                paths={windFarm.areaPoints}
                options={{
                  fillColor: fillColor,
                  fillOpacity: 0.1,
                  strokeColor: fillColor,
                  strokeOpacity: 0.4,
                  strokeWeight: 1
                }}
              />
            );
          } else if (windFarm.area) {
            // If we only have the area in km², create a sized circle
            // Convert km² to meters radius using area = π*r²
            const areaInSquareMeters = windFarm.area * 1000000;
            const radiusInMeters = Math.sqrt(areaInSquareMeters / Math.PI);
            
            areaVisualization = (
              <MemoizedCircle
                center={position}
                radius={radiusInMeters}
                options={{
                  fillColor: fillColor,
                  fillOpacity: 0.1,
                  strokeColor: fillColor,
                  strokeOpacity: 0.4,
                  strokeWeight: 1
                }}
              />
            );
          } else {
            // Calculate estimated area based on capacity and turbines
            let estimatedArea;
            if (windFarm.turbines) {
              estimatedArea = windFarm.turbines * 1.0;
            } else {
              estimatedArea = windFarm.capacity / 6.5;
            }
            
            const areaInSquareMeters = estimatedArea * 1000000;
            const radiusInMeters = Math.sqrt(areaInSquareMeters / Math.PI);
            
            areaVisualization = (
              <MemoizedCircle
                center={position}
                radius={radiusInMeters}
                options={{
                  fillColor: fillColor,
                  fillOpacity: 0.1,
                  strokeColor: fillColor,
                  strokeOpacity: 0.4,
                  strokeWeight: 1
                }}
              />
            );
          }
        } else if (isMediumDetail) {
          // Simplified visualization for medium zoom levels
          // Just use a circle with a simplified radius calculation
          let radius;
          
          if (windFarm.area) {
            // Use the known area but with simplified calculation
            radius = Math.sqrt(windFarm.area) * 1000; // Simplified conversion to meters
          } else if (windFarm.capacity > 500) {
            radius = 15000; // Large wind farm
          } else if (windFarm.capacity > 100) {
            radius = 10000; // Medium wind farm
          } else {
            radius = 5000; // Small wind farm
          }
          
          areaVisualization = (
            <MemoizedCircle
              center={position}
              radius={radius}
              options={{
                fillColor: fillColor,
                fillOpacity: 0.08,
                strokeColor: fillColor,
                strokeOpacity: 0.3,
                strokeWeight: 1
              }}
            />
          );
        } else {
          // No area visualization at low zoom levels - just markers
          areaVisualization = null;
        }
        
        return (
          <React.Fragment key={`wind-farm-${windFarm.name}`}>
            <MemoizedMarker
              position={position}
              icon={windFarmIcon}
              onClick={(e) => {
                // Prevent event propagation to the map
                if (e && e.domEvent) {
                  e.domEvent.stopPropagation();
                }
                
                // Don't immediately close the tooltip if we're clicking on a wind farm
                e && e.stop && e.stop();
                
                // Calculate estimated area if not provided
                let displayArea = windFarm.area;
                if (!displayArea) {
                  if (windFarm.turbines) {
                    displayArea = Math.round(windFarm.turbines * 1.0);
                  } else {
                    displayArea = Math.round(windFarm.capacity / 6.5);
                  }
                }
                
                console.log("Wind farm clicked:", windFarm.name);
                
                // Create a wind farm object with all necessary properties
                const windFarmObj = {
                  id: `wind-farm-${windFarm.name}`,
                  name: windFarm.name,
                  type: 'wind-farm',
                  flag: windFarm.country,
                  operator: windFarm.country,
                  capacity: windFarm.capacity,
                  status: windFarm.status,
                  area: displayArea,
                  turbines: windFarm.turbines,
                  estimatedArea: !windFarm.area,
                  isWindFarm: true
                };
                
                // Set immediately without delay
                setSelectedVessel(windFarmObj);
              }}
              zIndex={50}
            />
            
            {areaVisualization}
          </React.Fragment>
        );
      });
  }, [showWindFarms, isInMapBounds, currentZoom, windFarmsData]);
  
  // Separate function to render ONLY radar coverage with zoom-based detail
  const renderRadarCoverage = useCallback(() => {
    if (!showWindFarms || !showRadarCoverage) return null;
    
    // Skip rendering radar coverage at low zoom levels for performance
    if (currentZoom < 6) return null;
    
    // Filter to only show radar coverage for wind farms in the current bounds
    const visibleWindFarms = windFarmsData.filter(farm => 
      isInMapBounds(farm.lat, farm.lng)
    );
    
    const isHighDetail = currentZoom >= 8;
    
    return visibleWindFarms.map(windFarm => {
      const position = { lat: windFarm.lat, lng: windFarm.lng };
      const radarCoverageRadius = 77784; // 42 nautical miles in meters
      
      return (
        <MemoizedCircle
          key={`radar-${windFarm.name}`}
          center={position}
          radius={radarCoverageRadius}
          options={{
            fillColor: '#FF0000',
            fillOpacity: isHighDetail ? 0.05 : 0.03,
            strokeColor: '#FF0000',
            strokeOpacity: isHighDetail ? 0.7 : 0.5,
            strokeWeight: isHighDetail ? 1 : 0.5,
            strokeDashArray: [5, 5], // Dashed line pattern
          }}
        />
      );
    });
  }, [showWindFarms, showRadarCoverage, isInMapBounds, currentZoom, windFarmsData]);
  
  // Function to render vessel radar coverage based on gross tonnage with zoom-based detail
  const renderVesselRadarCoverage = useCallback(() => {
    // Skip rendering vessel radar at low zoom levels for performance
    if (currentZoom < 6) return null;
    
    const result = [];
    
    // Render medium vessels (GT 300-2999) with 20 NM radar
    if (showVesselRadar) {
      // Filter vessels to show radar only for commercial vessels with GT 300-2999
      // Exclude Russian ships from having radar
      const mediumVessels = vessels.filter(v => 
        (v.type === 'commercial' || v.type === 'tanker' || v.type === 'passenger') && 
        !v.isRussian && // Exclude Russian ships from having radar
        v.grossTonnage >= 300 && v.grossTonnage < 3000 &&
        isInMapBounds(v.position[1], v.position[0])
      );
      
      const isHighDetail = currentZoom >= 8;
      
      mediumVessels.forEach(vessel => {
        const position = { lat: vessel.position[1], lng: vessel.position[0] };
        
        // Medium vessels have 20 NM radar range
        const radarRangeNM = 20;
        // Convert NM to meters (1 NM = 1852 meters)
        const radarRangeMeters = radarRangeNM * 1852;
        
        result.push(
          <MemoizedCircle
            key={`vessel-radar-${vessel.id}`}
            center={position}
            radius={radarRangeMeters}
            options={{
              fillColor: '#4285F4',
              fillOpacity: isHighDetail ? 0.03 : 0.02,
              strokeColor: '#4285F4',
              strokeOpacity: isHighDetail ? 0.6 : 0.4,
              strokeWeight: isHighDetail ? 1 : 0.5,
              strokeDashArray: [5, 5], // Dashed line pattern
            }}
          />
        );
      });
    }
    
    // Render large vessels (GT >= 3000) with 40 NM radar
    if (showLargeVesselRadar) {
      // Filter vessels to show radar only for commercial vessels with GT >= 3000
      // Exclude Russian ships from having radar
      const largeVessels = vessels.filter(v => 
        (v.type === 'commercial' || v.type === 'tanker' || v.type === 'passenger') && 
        !v.isRussian && // Exclude Russian ships from having radar
        v.grossTonnage >= 3000 &&
        isInMapBounds(v.position[1], v.position[0])
      );
      
      const isHighDetail = currentZoom >= 8;
      
      largeVessels.forEach(vessel => {
        const position = { lat: vessel.position[1], lng: vessel.position[0] };
        
        // Large vessels have 40 NM radar range
        const radarRangeNM = 40;
        // Convert NM to meters (1 NM = 1852 meters)
        const radarRangeMeters = radarRangeNM * 1852;
        
        result.push(
          <MemoizedCircle
            key={`large-vessel-radar-${vessel.id}`}
            center={position}
            radius={radarRangeMeters}
            options={{
              fillColor: '#4285F4',
              fillOpacity: isHighDetail ? 0.03 : 0.02,
              strokeColor: '#4285F4',
              strokeOpacity: isHighDetail ? 0.6 : 0.4,
              strokeWeight: isHighDetail ? 1 : 0.5,
              strokeDashArray: [5, 5], // Dashed line pattern
            }}
          />
        );
      });
    }
    
    return result;
  }, [showVesselRadar, showLargeVesselRadar, vessels, isInMapBounds, currentZoom]);
  
  // Function to render SeaMesh interception lines between vessel radars and Russian vessels
  const renderSeaMeshInterception = useCallback(() => {
    if (!showSeaMesh || currentZoom < 6) return null;
    
    const result = [];
    
    // Get medium vessels with radar capability (GT 300-2999)
    const mediumRadarVessels = showVesselRadar ? vessels.filter(v => 
      (v.type === 'commercial' || v.type === 'tanker' || v.type === 'passenger') && 
      v.grossTonnage >= 300 && v.grossTonnage < 3000 &&
      isInMapBounds(v.position[1], v.position[0])
    ) : [];
    
    // Get large vessels with radar capability (GT >= 3000)
    const largeRadarVessels = showLargeVesselRadar ? vessels.filter(v => 
      (v.type === 'commercial' || v.type === 'tanker' || v.type === 'passenger') && 
      v.grossTonnage >= 3000 &&
      isInMapBounds(v.position[1], v.position[0])
    ) : [];
    
    // Get all Russian vessels in bounds
    const russianVessels = vessels.filter(v => 
      v.isRussian && isInMapBounds(v.position[1], v.position[0])
    );
    
    const hasRadarVessels = mediumRadarVessels.length > 0 || largeRadarVessels.length > 0;
    if (!hasRadarVessels || russianVessels.length === 0) return result;
    
    // Calculate all possible interceptions (Russian vessel + distance + radar vessel)
    const interceptions = [];
    
    russianVessels.forEach(russianVessel => {
      // Add medium vessel interceptions
      mediumRadarVessels.forEach(radarVessel => {
        const dx = radarVessel.position[0] - russianVessel.position[0];
        const dy = radarVessel.position[1] - russianVessel.position[1];
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        interceptions.push({
          russianVessel,
          radarVessel,
          distance,
          isLargeVessel: false
        });
      });
      
      // Add large vessel interceptions
      largeRadarVessels.forEach(radarVessel => {
        const dx = radarVessel.position[0] - russianVessel.position[0];
        const dy = radarVessel.position[1] - russianVessel.position[1];
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        interceptions.push({
          russianVessel,
          radarVessel,
          distance,
          isLargeVessel: true
        });
      });
    });
    
    // Sort interceptions by distance and take only the 5 closest
    interceptions.sort((a, b) => a.distance - b.distance);
    const topInterceptions = interceptions.slice(0, 5);
    
    // Draw lines for the closest interceptions
    topInterceptions.forEach(({ russianVessel, radarVessel, isLargeVessel }) => {
      result.push(
        <Polyline
          key={`seamesh-${russianVessel.id}-${radarVessel.id}`}
          path={[
            { lat: russianVessel.position[1], lng: russianVessel.position[0] },
            { lat: radarVessel.position[1], lng: radarVessel.position[0] }
          ]}
          options={{
            strokeColor: isLargeVessel ? '#FF7F00' : '#FF4500', // Different color for large vessels
            strokeOpacity: 0.7,
            strokeWeight: isLargeVessel ? 2 : 1.5, // Thicker line for large vessels
            geodesic: true,
            icons: [{
              icon: {
                path: 'M 0,-1 0,1',
                strokeOpacity: 1,
                scale: isLargeVessel ? 4 : 3  // Larger icons for large vessels
              },
              offset: '0',
              repeat: isLargeVessel ? '20px' : '15px' // Different pattern for large vessels
            }]
          }}
        />
      );
    });
    
    return result;
  }, [showSeaMesh, showVesselRadar, showLargeVesselRadar, vessels, isInMapBounds, currentZoom]);
  
  // Function to render AirMesh interception lines between wind farm radars and Russian drones
  const renderAirMeshInterception = useCallback(() => {
    if (!showAirMesh || currentZoom < 6) return null;
    
    const result = [];
    
    // Only proceed if we have wind farms with radar and wind farms are shown
    if (!showWindFarms || !showRadarCoverage) return result;
    
    // Filter to only show wind farms in the current bounds
    const radarWindFarms = windFarmsData.filter(farm => 
      isInMapBounds(farm.lat, farm.lng)
    );
    
    // Get all Russian drones in bounds that are moving
    const russianDrones = vessels.filter(v => 
      v.isRussian && 
      v.type === 'drone' && 
      v.speed > 0 && // Only include moving drones
      isInMapBounds(v.position[1], v.position[0])
    );
    
    if (radarWindFarms.length === 0 || russianDrones.length === 0) return result;
    
    // Process each drone separately for intercepts
    russianDrones.forEach(drone => {
      // Calculate all possible interceptions for this drone that are within range
      const droneInterceptions = [];
      
      // Calculate distance to each wind farm and check if in radar range
      radarWindFarms.forEach(windFarm => {
        const dx = windFarm.lng - drone.position[0];
        const dy = windFarm.lat - drone.position[1];
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Convert distance to nautical miles (1 degree ≈ 60 nautical miles at the equator)
        const distanceInNM = distance * 60;
        
        // Only add interception if drone is within radar range (42 NM)
        if (distanceInNM <= 42) {
          droneInterceptions.push({
            drone,
            windFarm,
            distance
          });
        }
      });
      
      // If there are any wind farms in range for this drone
      if (droneInterceptions.length > 0) {
        // Sort interceptions by distance and take only the 5 closest for this drone
        droneInterceptions.sort((a, b) => a.distance - b.distance);
        const topDroneInterceptions = droneInterceptions.slice(0, 5);
        
        // Draw lines for the closest interceptions for this drone
        topDroneInterceptions.forEach(interception => {
          result.push(
            <Polyline
              key={`airmesh-${interception.drone.id}-${interception.windFarm.name}`}
              path={[
                { lat: interception.drone.position[1], lng: interception.drone.position[0] },
                { lat: interception.windFarm.lat, lng: interception.windFarm.lng }
              ]}
              options={{
                strokeColor: '#4B0082', // Indigo color for Air Mesh
                strokeOpacity: 0.8,
                strokeWeight: 2,
                geodesic: true,
                icons: [{
                  icon: {
                    path: 'M 0,-1 0,1',
                    strokeOpacity: 1,
                    scale: 4
                  },
                  offset: '0',
                  repeat: '20px'
                }]
              }}
            />
          );
        });
      }
    });
    
    return result;
  }, [showAirMesh, showWindFarms, showRadarCoverage, windFarmsData, vessels, isInMapBounds, currentZoom]);
  
  // Update the map when display mode changes
  useEffect(() => {
    // This effect updates the Google Maps styling when display mode changes
    mapOptions.styles = getMapStyle(displayMode);
    
    // If map is loaded, we can update its options
    if (mapRef.current) {
      mapRef.current.setOptions(mapOptions);
    }
  }, [displayMode, mapOptions]);
  
  // onMapLoad with error handling 
  const onMapLoad = useCallback((map) => {
    console.log("Map loaded successfully");
    mapRef.current = map;
    
    // Make sure dragging is enabled
    map.setOptions({
      draggable: true,
      zoomControl: false,
      scrollwheel: true,
      disableDoubleClickZoom: false
    });
    
    // We can store the map's zoom control functionality
    zoomRef.current = {
      zoomIn: () => {
        const newZoom = map.getZoom() + 1;
        map.setZoom(newZoom);
        setCurrentZoom(newZoom);
      },
      zoomOut: () => {
        const newZoom = map.getZoom() - 1;
        map.setZoom(newZoom);
        setCurrentZoom(newZoom);
      }
    };
    
    // Get initial bounds
    if (map.getBounds()) {
      const bounds = map.getBounds();
      setMapBounds({
        north: bounds.getNorthEast().lat(),
        east: bounds.getNorthEast().lng(),
        south: bounds.getSouthWest().lat(),
        west: bounds.getSouthWest().lng()
      });
      
      // Initialize current center from the map
      const center = map.getCenter();
      setCurrentMapCenter({
        lat: center.lat(),
        lng: center.lng()
      });
    }
    
    // Set initial zoom
    setCurrentZoom(map.getZoom());
  }, []);
  
  // Add a click handler to the map background to deselect the current vessel
  const handleMapClick = () => {
    // Simply close the vessel display when map is clicked
    // Using the simplest possible approach to avoid any errors
    setSelectedVessel(null);
  };
  
  // Get visible vessel count - memoized for sidebar display
  const visibleVesselCount = useMemo(() => 
    vessels.filter(v => {
      const matchesFilter = filters.all || 
                         (filters.commercial && (v.type === 'commercial' || v.type === 'passenger' || v.type === 'tanker')) || 
                         (filters.military && v.type === 'military') || 
                         (filters.submarine && v.type === 'submarine') || 
                         (filters.drone && v.type === 'drone') || 
                         (filters.russian && v.isRussian && v.type !== 'submarine' && v.type !== 'drone');
      return matchesFilter;
    }).length
  , [vessels, filters]);
  
  // Get only vessels visible in current sidebar (both filtered and in bounds) - memoized
  const displayedVessels = useMemo(() => 
    vessels.filter(v => {
      const matchesFilter = filters.all || 
                          (filters.commercial && (v.type === 'commercial' || v.type === 'passenger' || v.type === 'tanker')) || 
                          (filters.military && v.type === 'military') || 
                          (filters.submarine && v.type === 'submarine') || 
                          (filters.drone && v.type === 'drone') || 
                          (filters.russian && v.isRussian && v.type !== 'submarine' && v.type !== 'drone');
      
      const inBounds = isInMapBounds(v.position[1], v.position[0]);
      
      return matchesFilter && inBounds;
    }).slice(0, 50) // Still limit to 50 for performance
  , [vessels, filters, isInMapBounds]);
  
  // Memoize UI elements that don't need frequent updates
  const controlPanels = useMemo(() => (
    <>
      <div className="control-panel">
        <h2 className="text-sm font-semibold mb-3 palantir-heading">Display Mode</h2>
        <div className="flex flex-col gap-3">
          <button 
            className="active"
            onClick={() => setDisplayMode('radar')}
          >
            <Radio size={16} className="mr-1" />
            Radar
          </button>
        </div>
      </div>
      
      <div className="control-panel">
        <h2 className="text-sm font-semibold mb-2 palantir-heading">Vessel Filter</h2>
        <div className="flex flex-row flex-wrap">
          <button 
            className={filters.all ? 'active' : ''} 
            onClick={() => {
              // If all is being turned on, turn off other filters
              if (!filters.all) {
                setFilters({
                  all: true,
                  commercial: false, 
                  military: false,
                  submarine: false,
                  drone: false,
                  russian: false
                });
              } else {
                // If all is being turned off, leave other filters unchanged
                setFilters({
                  ...filters,
                  all: false
                });
              }
            }}
          >
            All
          </button>
          <button 
            className={filters.commercial ? 'active' : ''} 
            onClick={() => {
              // Toggle the commercial filter
              const newCommercialState = !filters.commercial;
              setFilters({
                ...filters,
                all: false,
                commercial: newCommercialState
              });
            }}
          >
            Commercial
          </button>
          <button 
            className={filters.military ? 'active' : ''} 
            onClick={() => {
              // Toggle the military filter
              const newMilitaryState = !filters.military;
              setFilters({
                ...filters,
                all: false,
                military: newMilitaryState
              });
            }}
          >
            Military
          </button>
          <button 
            className={filters.submarine ? 'active' : ''} 
            onClick={() => {
              // Toggle the submarine filter
              const newSubmarineState = !filters.submarine;
              setFilters({
                ...filters,
                all: false,
                submarine: newSubmarineState
              });
            }}
          >
            Russian Submarines
          </button>
          <button 
            className={filters.drone ? 'active' : ''} 
            onClick={() => {
              // Toggle the drone filter
              const newDroneState = !filters.drone;
              setFilters({
                ...filters,
                all: false,
                drone: newDroneState
              });
            }}
          >
            Russian Drones
          </button>
          <button 
            className={filters.russian ? 'active' : ''} 
            onClick={() => {
              // Toggle the russian filter
              const newRussianState = !filters.russian;
              setFilters({
                ...filters,
                all: false,
                russian: newRussianState
              });
            }}
          >
            Russian Ships
          </button>
        </div>
      </div>

      <div className="control-panel">
        <h2 className="text-sm font-semibold mb-3 palantir-heading">Wind Infrastructure</h2>
        <div className="flex flex-col gap-2">
          <button 
            className={showWindFarms ? 'active' : ''}
            onClick={() => {
              const newShowWindFarms = !showWindFarms;
              setShowWindFarms(newShowWindFarms);
              // If turning off wind farms, ensure radar coverage is also off
              if (!newShowWindFarms) {
                setShowRadarCoverage(false);
              }
            }}
          >
            <Wind size={16} className="mr-1" />
            Wind Farms {showWindFarms ? '(Shown)' : '(Hidden)'}
          </button>
          <button 
            className={showRadarCoverage ? 'active' : ''}
            onClick={() => {
              setShowRadarCoverage(!showRadarCoverage);
            }}
            disabled={!showWindFarms}
            style={{ opacity: !showWindFarms ? 0.5 : 1 }}
          >
            <Radar size={16} className="mr-1" />
            Radar Coverage (42 NM)
          </button>
          <button 
            className={showAirMesh ? 'active' : ''}
            onClick={() => {
              setShowAirMesh(!showAirMesh);
            }}
            disabled={!showWindFarms || !showRadarCoverage}
            style={{ 
              opacity: (!showWindFarms || !showRadarCoverage) ? 0.5 : 1,
              backgroundColor: showAirMesh ? '#4B0082' : 'transparent',
              color: showAirMesh ? '#FFFFFF' : 'inherit', 
              padding: '8px 16px',
              borderRadius: '4px',
              border: '1px solid #4B0082',
              cursor: 'pointer'
            }}
          >
            <Radar size={16} className="mr-1" />
            Air Mesh
          </button>
        </div>
      </div>

      <div className="control-panel">
        <h2 className="text-sm font-semibold mb-3 palantir-heading">Commercial Vessel Infrastructure</h2>
        <div className="flex flex-col gap-2">
          <button 
            className={showVesselRadar ? 'active' : ''}
            onClick={() => setShowVesselRadar(!showVesselRadar)}
          >
            <Radar size={16} className="mr-1" />
            Vessel Radar (GT 300-2999)
          </button>
          <button 
            className={showLargeVesselRadar ? 'active' : ''}
            onClick={() => setShowLargeVesselRadar(!showLargeVesselRadar)}
          >
            <Radar size={16} className="mr-1" />
            Vessel Radar (GT &gt; 3000)
          </button>
          <button 
            className={showSeaMesh ? 'active' : ''}
            onClick={() => setShowSeaMesh(!showSeaMesh)}
            disabled={!showVesselRadar && !showLargeVesselRadar}
            style={{ 
              opacity: (!showVesselRadar && !showLargeVesselRadar) ? 0.5 : 1,
              backgroundColor: showSeaMesh ? '#8B0000' : 'transparent',
              color: showSeaMesh ? '#FFFFFF' : 'inherit', 
              padding: '8px 16px',
              borderRadius: '4px',
              border: '1px solid #8B0000',
              cursor: 'pointer'
            }}
          >
            <Radar size={16} className="mr-1" />
            Sea Mesh
          </button>
        </div>
      </div>
      
      {/* Add simulation controls panel */}
      <div className="control-panel">
        <h2 className="text-sm font-semibold mb-3 palantir-heading">Vessel Simulation</h2>
        <div className="flex flex-col gap-3">
          <button 
            className={simulationEnabled ? 'active' : ''}
            onClick={() => setSimulationEnabled(!simulationEnabled)}
          >
            <Ship size={16} className="mr-1" />
            {simulationEnabled ? 'Pause Movement' : 'Start Movement'}
          </button>
          <div className="flex flex-col">
            <span className="text-xs mb-1">Speed: {simulationSpeed}x</span>
            <input 
              type="range" 
              min="1" 
              max="50" 
              value={simulationSpeed}
              onChange={(e) => setSimulationSpeed(parseInt(e.target.value))}
              className="w-2/5 max-w-[80px] accent-blue-500"
            />
          </div>
        </div>
      </div>
    </>
  ), [displayMode, filters, showWindFarms, showRadarCoverage, showVesselRadar, showLargeVesselRadar, showSeaMesh, showAirMesh, simulationEnabled, simulationSpeed]);
  
  // Add debugging for selectedVessel state changes
  useEffect(() => {
    console.log("selectedVessel updated:", selectedVessel);
    
    // Add debugging to check if selectedVessel is correctly set
    if (selectedVessel) {
      console.log("Selected vessel details:", {
        id: selectedVessel.id,
        name: selectedVessel.name,
        type: selectedVessel.type,
        isWindFarm: selectedVessel.isWindFarm
      });
      
      // Force a small UI update to trigger re-renders
      const refreshTimer = setTimeout(() => {
        // This just forces a small UI update
        const dummyEvent = new Event('resize');
        window.dispatchEvent(dummyEvent);
      }, 100);
      
      return () => clearTimeout(refreshTimer);
    }
  }, [selectedVessel]);
  
  // Simplified reset function that resets to initial state
  const handleReset = () => {
    // Attempt to reset the map view if available
    if (mapRef.current) {
      mapRef.current.setCenter(defaultCenter);
      mapRef.current.setZoom(6);
    }
    
    // Reset state
    setDisplayMode('radar');
    setFilters({
      all: true,
      commercial: false,
      military: false,
      submarine: false,
      drone: false,
      russian: false
    });
    setShowWindFarms(false);
    setShowRadarCoverage(false);
    setShowVesselRadar(false);
    setShowLargeVesselRadar(false);
    setShowSeaMesh(false);
    setShowAirMesh(false);
    setSelectedVessel(null);
    setSimulationEnabled(false);
    setSimulationSpeed(10);
    
    // Force map components to remount
    setMapKey(Date.now());
  };
  
  // Update UI to include display mode toggle
  return (
    <div className="baltic-tracker-container">
      <div className="flex h-screen">
        {showSidebar && (
          <div className="sidebar w-80">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-semibold palantir-heading" style={{ color: '#8B0000' }}>Baltic Sea Tracker</h2>
              <button onClick={() => setShowSidebar(false)} className="text-gray-400 hover:text-white">
                <Menu size={20} />
              </button>
            </div>
            
            {controlPanels}
          </div>
        )}

        <div className="flex-1 relative">
          {!showSidebar && (
            <button
              className="absolute top-4 left-4 z-10 bg-gray-800 p-2 rounded-md hover:bg-gray-700"
              onClick={() => setShowSidebar(true)}
            >
              <Menu size={20} />
            </button>
          )}
          
          {/* Simplified Google Maps integration */}
          {loadError && (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 text-white p-4">
              <div className="text-xl mb-4">Error loading Google Maps: {loadError.message}</div>
            </div>
          )}
          
          {!loadError && isLoaded ? (
            <GoogleMap
              mapContainerStyle={mapContainerStyle}
              center={mapCenter}
              zoom={mapZoom}
              onClick={handleMapClick}
              onLoad={onMapLoad}
              options={mapOptions}
              onZoomChanged={() => {
                if (mapRef.current) {
                  setCurrentZoom(mapRef.current.getZoom());
                }
              }}
              onBoundsChanged={() => {
                if (mapRef.current && mapRef.current.getBounds()) {
                  const bounds = mapRef.current.getBounds();
                  setMapBounds({
                    north: bounds.getNorthEast().lat(),
                    east: bounds.getNorthEast().lng(),
                    south: bounds.getSouthWest().lat(),
                    west: bounds.getSouthWest().lng()
                  });
                  
                  const center = mapRef.current.getCenter();
                  setCurrentMapCenter({
                    lat: center.lat(),
                    lng: center.lng()
                  });
                }
              }}
              key={mapKey} /* Add a key to force remount when needed */
            >
              {vessels.length > 0 && renderVessels()}
              {showWindFarms && renderWindFarms()}
              {showRadarCoverage && renderRadarCoverage()}
              {(showVesselRadar || showLargeVesselRadar) && renderVesselRadarCoverage()}
              {showSeaMesh && renderSeaMeshInterception()}
              {showAirMesh && renderAirMeshInterception()}
              
              {/* New vessel detail panel positioned in top right corner */}
              {selectedVessel && (
                <div 
                  className="vessel-tooltip"
                  onClick={(e) => {
                    // Stop propagation to prevent map click from closing the tooltip
                    e.stopPropagation();
                  }}
                  style={{
                    position: 'absolute',
                    right: '20px',
                    top: '20px',
                    backgroundColor: 'rgba(17, 24, 39, 0.95)',
                    borderRadius: '4px',
                    padding: '12px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.7)',
                    zIndex: 9999,
                    maxWidth: '280px',
                    border: '1px solid #3d85c6',
                    color: 'white',
                    fontFamily: "'Inter', 'Roboto', sans-serif"
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: '600', margin: 0, color: '#3d85c6' }} className="palantir-heading">
                      {selectedVessel.name || 'Unknown Vessel'}
                    </h3>
                    <button 
                      onClick={(e) => {
                        // Prevent any event bubbling and close the tooltip
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedVessel(null);
                      }}
                      style={{ 
                        background: 'none', 
                        border: 'none', 
                        color: '#6b7280', 
                        fontSize: '16px',
                        cursor: 'pointer',
                        padding: '0 5px'
                      }}
                    >
                      ×
                    </button>
                  </div>
                  
                  <div style={{ fontSize: '12px', color: '#d1d5db' }}>
                    {selectedVessel.isWindFarm ? (
                      <>
                        <div style={{ margin: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#9ca3af' }}>Type:</span>
                          <span>Wind Farm</span>
                        </div>
                        <div style={{ margin: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#9ca3af' }}>Country:</span>
                          <span>{selectedVessel.flag}</span>
                        </div>
                        <div style={{ margin: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#9ca3af' }}>Capacity:</span>
                          <span>{selectedVessel.capacity} MW</span>
                        </div>
                        {selectedVessel.turbines && (
                          <div style={{ margin: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#9ca3af' }}>Turbines:</span>
                            <span>{selectedVessel.turbines}</span>
                          </div>
                        )}
                        {selectedVessel.area && (
                          <div style={{ margin: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#9ca3af' }}>Area:</span>
                            <span>{selectedVessel.area} km²</span>
                          </div>
                        )}
                        <div style={{ margin: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#9ca3af' }}>Status:</span>
                          <span>{selectedVessel.status}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ margin: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#9ca3af' }}>Flag:</span>
                          <span>{selectedVessel.flag}</span>
                        </div>
                        <div style={{ margin: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#9ca3af' }}>Type:</span>
                          <span>{selectedVessel.type}</span>
                        </div>
                        {selectedVessel.operator && (
                          <div style={{ margin: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#9ca3af' }}>Operator:</span>
                            <span>{selectedVessel.operator}</span>
                          </div>
                        )}
                        {selectedVessel.length && (
                          <div style={{ margin: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#9ca3af' }}>Length:</span>
                            <span>{selectedVessel.length}m</span>
                          </div>
                        )}
                        {selectedVessel.speed && (
                          <div style={{ margin: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#9ca3af' }}>Speed:</span>
                            <span>{selectedVessel.speed} knots</span>
                          </div>
                        )}
                        {selectedVessel.heading && (
                          <div style={{ margin: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#9ca3af' }}>Heading:</span>
                            <span>{selectedVessel.heading}°</span>
                          </div>
                        )}
                        {selectedVessel.grossTonnage && (
                          <div style={{ margin: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#9ca3af' }}>Gross Tonnage:</span>
                            <span>{selectedVessel.grossTonnage} GT</span>
                          </div>
                        )}
                        {selectedVessel.type === 'submarine' && (
                          <div style={{ margin: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#9ca3af' }}>Depth:</span>
                            <span>{selectedVessel.depth}m ({selectedVessel.isSubmerged ? 'Submerged' : 'Surfaced'})</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </GoogleMap>
          ) : !loadError ? (
            <div className="w-full h-full flex items-center justify-center bg-gray-900 text-white">
              <div className="text-xl">Loading map...</div>
            </div>
          ) : null}
          
          <div className="absolute bottom-4 right-4 flex gap-2">
            <button 
              onClick={() => zoomRef.current && zoomRef.current.zoomIn()}
              className="bg-gray-800 hover:bg-gray-700 p-2 rounded-md shadow-lg"
            >
              <ZoomIn size={20} className="text-blue-400" />
            </button>
            <button 
              onClick={() => zoomRef.current && zoomRef.current.zoomOut()}
              className="bg-gray-800 hover:bg-gray-700 p-2 rounded-md shadow-lg"
            >
              <ZoomOut size={20} className="text-blue-400" />
            </button>
          </div>
          
          {/* Move the Reset filters button to bottom-right corner */}
          <button
            onClick={handleReset}
            style={{
              position: 'absolute',
              bottom: '20px',
              right: '20px',
              backgroundColor: '#8B0000',
              color: '#FFFFFF',
              padding: '8px 16px',
              borderRadius: '4px',
              border: 'none',
              fontWeight: 'normal',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
              zIndex: 9999,
              fontSize: '14px'
            }}
          >
            Reset filters
          </button>
        </div>
      </div>
      
      <div className="bg-gray-800 p-2 text-center text-sm text-gray-400">
        <div className="flex justify-center items-center">
          <Info size={16} className="mr-1 text-blue-400" />
          <span style={{ color: '#8B0000' }}>Baltic Sea Tracker - {
            filters.all ? 
              vessels.length : 
              vessels.filter(v => 
                (filters.commercial && (v.type === 'commercial' || v.type === 'passenger' || v.type === 'tanker')) || 
                (filters.military && v.type === 'military') || 
                (filters.submarine && v.type === 'submarine') || 
                (filters.drone && v.type === 'drone') || 
                (filters.russian && v.isRussian && v.type !== 'submarine' && v.type !== 'drone')
              ).length
          } vessels in {displayMode} mode | Zoom: {currentZoom}</span>
          {showWindFarms && <span className="mx-1 text-amber-400">| Wind Farms Shown</span>}
          {showRadarCoverage && showWindFarms && <span className="mx-1 text-red-400">| Radar Coverage (42 NM)</span>}
          {showVesselRadar && <span className="mx-1 text-blue-400">| Vessel Radar (20/40 NM)</span>}
          {showSeaMesh && <span className="mx-1 text-orange-400">| Sea Mesh Active</span>}
          {showAirMesh && <span className="mx-1 text-purple-400">| AirMesh Active</span>}
          {simulationEnabled && <span className="mx-1 text-green-400">| Vessel Movement ({simulationSpeed}x)</span>}
        </div>
      </div>
    </div>
  );
}

export default BalticSeaTracker;
