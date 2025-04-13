import React, { useEffect, useState, useRef, useCallback, useMemo, memo } from 'react';
import { Info, Ship, Menu, ZoomIn, ZoomOut, Radar, Waves, Layers, Wind } from 'lucide-react';
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
  const [filter, setFilter] = useState('all');
  const [showSidebar, setShowSidebar] = useState(true);
  const [displayMode, setDisplayMode] = useState('radar'); // 'radar', 'sonar', or 'fused'
  const [showWindFarms, setShowWindFarms] = useState(false);
  const [showRadarCoverage, setShowRadarCoverage] = useState(false); // New state for radar coverage
  const [showVesselRadar, setShowVesselRadar] = useState(false); // State for vessel radar coverage (300-2999 GT)
  const [showLargeVesselRadar, setShowLargeVesselRadar] = useState(false); // New state for large vessel radar (>3000 GT)
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
    switch(mode) {
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
      case 'sonar':
        return [
          { elementType: "geometry", stylers: [{ color: "#003545" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#003545" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#00C8FF" }] },
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#001E29" }] },
          { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#00E5FF" }] },
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
      case 'fused':
        return [
          { elementType: "geometry", stylers: [{ color: "#142639" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#142639" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#3D85C6" }] },
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#0A1C2A" }] },
          { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4a90e2" }] },
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
      default:
        return [];
    }
  }
    
  // Function to generate a random coordinate within Baltic Sea
  const randomCoordinate = () => {
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
    
    // Increase the spread factor to ensure better dispersal within areas
    // Create a much more randomized distribution within the selected area
    // rather than clustering toward the center
    
    // Get random point within the selected area with high dispersal
    // Avoiding the tendency to cluster in the center
    return [
      selectedLane.minLng + Math.random() * (selectedLane.maxLng - selectedLane.minLng), // longitude - fully random within area
      selectedLane.minLat + Math.random() * (selectedLane.maxLat - selectedLane.minLat)  // latitude - fully random within area
    ];
  };
  
  // Generate 300 simulated vessels with realistic properties (reduced from 1000)
  const generateVessels = useCallback(() => {
    const vesselTypes = ['commercial', 'military', 'fishing', 'passenger', 'tanker'];
    const flags = ['Finland', 'Sweden', 'Estonia', 'Latvia', 'Lithuania', 'Poland', 'Germany', 'Denmark', 'Russia'];
    const russianOperators = ['Sovcomflot', 'Gazprom Fleet', 'Rosmorport', 'Russian Navy', 'Rosneft'];
    const commercialOperators = ['Maersk', 'MSC', 'CMA CGM', 'Hapag-Lloyd', 'ONE', 'Evergreen', 'COSCO', 
                                'Yang Ming', 'HMM', 'Grimaldi', 'DFDS', 'Stena Line', 'Tallink', 'Viking Line'];
    
    // Generate vessels with better dispersal throughout the Baltic Sea
    const generatedVessels = [];
    const occupiedPositions = []; // Track positions to ensure better dispersal
    const MIN_DISTANCE = 0.2; // Minimum distance between vessels in degrees (approx 10-20km)
    
    // Start with fewer vessels and then disperse them more effectively
    const maxAttempts = 300; // Limit how many times we try to place each vessel
    let placedVesselCount = 0;
    
    // Try to place vessels with appropriate spacing
    for (let i = 1; placedVesselCount < 300 && i <= maxAttempts; i++) {
      const type = vesselTypes[Math.floor(Math.random() * vesselTypes.length)];
      const flag = flags[Math.floor(Math.random() * flags.length)];
      const isRussian = flag === 'Russia' || (Math.random() < 0.05); // 5% chance of non-Russian flag but Russian operated
      
      // Get a potential position for the vessel
      const position = randomCoordinate();
      
      // Check if position is in a lake and ensure it's in the Baltic Sea
      // Baltic Sea general bounds
      const isInBalticSea = (
        position[1] >= 54.0 && position[1] <= 66.0 && // Latitude bounds
        position[0] >= 9.0 && position[0] <= 30.0     // Longitude bounds
      );
      
      // If not in Baltic Sea proper, skip this position
      if (!isInBalticSea) {
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
      const lat = position[1];
      const lng = position[0];
      
      // Baltic shipping lane direction tendencies
      if (lng < 14.0) {
        // Danish straits and western Baltic - generally east/west traffic
        heading = Math.random() < 0.7 ? 70 + Math.random() * 40 : 250 + Math.random() * 40;
      } else if (lng > 23.0 && lat > 59.0) {
        // Gulf of Finland - generally east/west traffic
        heading = Math.random() < 0.5 ? 80 + Math.random() * 30 : 260 + Math.random() * 30;
      } else if (lng > 19.0 && lat > 60.0) {
        // Gulf of Bothnia - generally north/south traffic
        heading = Math.random() < 0.5 ? 0 + Math.random() * 30 : 180 + Math.random() * 30;
      } else if (lng > 22.0 && lat < 58.0 && lat > 56.5) {
        // Gulf of Riga - generally north/south traffic
        heading = Math.random() < 0.5 ? 0 + Math.random() * 40 : 180 + Math.random() * 40;
      } else if (lat < 56.0 && lng > 18.0) {
        // Southern Baltic to Polish/Lithuanian ports
        heading = Math.random() < 0.6 ? 140 + Math.random() * 40 : 320 + Math.random() * 40;
      } else {
        // Central Baltic - mixed traffic patterns
        heading = Math.floor(Math.random() * 360);
      }
      
      // Realistic speed based on vessel type and weather (assumed normal conditions)
      let speed;
      if (type === 'commercial' || type === 'tanker') {
        speed = 10 + Math.floor(Math.random() * 8); // 10-18 knots
      } else if (type === 'passenger') {
        speed = 15 + Math.floor(Math.random() * 10); // 15-25 knots
      } else if (type === 'military') {
        speed = 5 + Math.floor(Math.random() * 25); // 5-30 knots (more variable)
      } else if (type === 'fishing') {
        // Fishing vessels move slower or may be stationary when fishing
        speed = Math.random() < 0.3 ? 0 : 5 + Math.floor(Math.random() * 7); // 0 or 5-12 knots
      } else {
        speed = Math.floor(Math.random() * 15) + 5; // 5-20 knots default
      }
      
      // Determine vessel size
      const length = type === 'tanker' || type === 'commercial' 
        ? 100 + Math.floor(Math.random() * 300) 
        : type === 'military' 
          ? 50 + Math.floor(Math.random() * 200)
          : 20 + Math.floor(Math.random() * 50);
      
      // Calculate gross tonnage (GT) based on vessel length and type
      // Using simplified formula based on vessel dimensions
      let grossTonnage;
      if (type === 'commercial' || type === 'tanker') {
        // Commercial and tanker vessels have higher GT/length ratios
        grossTonnage = Math.round(length * length * 0.18); // Approximation
      } else if (type === 'military') {
        // Military vessels are typically more dense but smaller
        grossTonnage = Math.round(length * length * 0.16);
      } else if (type === 'passenger') {
        // Passenger vessels have high volume and less dense cargo
        grossTonnage = Math.round(length * length * 0.2);
      } else {
        // Fishing and other vessels
        grossTonnage = Math.round(length * length * 0.12);
      }
      
      // Determine operator
      let operator;
      if (isRussian) {
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
      
      if (type === 'military' && isRussian) {
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
        type,
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
    
    return generatedVessels;
  }, []);
  
  // Generate vessel data when component mounts
  useEffect(() => {
    const simulatedVessels = generateVessels();
    setVessels(simulatedVessels);
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
    
    setVessels(prevVessels => {
      return prevVessels.map(vessel => {
        // Skip stationary vessels
        if (vessel.speed === 0) return vessel;
        
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
        
        return {
          ...vessel,
          position: [newLng, newLat],
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
      // Southern Sweden
      [55.0, 59.5, 12.5, 15.5],
      // Finland
      [59.7, 65.5, 21.0, 30.0],
      // Estonia
      [57.5, 59.7, 23.0, 28.5],
      // Latvia/Lithuania coast
      [55.5, 57.5, 21.0, 28.0],
      // Poland inland
      [54.0, 55.5, 15.0, 19.5],
      // Germany/Denmark inland
      [54.0, 56.0, 9.0, 12.0],
      // Gotland
      [56.8, 58.0, 18.0, 19.2],
      // Åland Islands
      [59.7, 60.5, 19.3, 21.3],
      // Bornholm
      [54.9, 55.3, 14.7, 15.2]
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
      [60.5, 63.5, 18.5, 21.5, 5]
    ];
    
    // Check if point is in a land area
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
          // 20% chance to consider it water if very close to edge
          // This randomness helps prevent getting stuck at boundaries
          return Math.random() < 0.2;
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
      // Swedish coast buffer
      [55.0, 59.5, 15.5, 16.0],
      // Finnish coast buffer
      [59.7, 65.5, 20.0, 21.0],
      // Estonian coast buffer
      [57.5, 59.7, 22.0, 23.0],
      // Latvian/Lithuanian coast buffer
      [55.5, 57.5, 20.0, 21.0],
      // Polish coast buffer
      [54.0, 55.5, 14.0, 15.0],
      // German/Danish coast buffer
      [54.0, 56.0, 12.0, 12.5]
    ];
    
    // Check coastal buffers with higher probability of rejection
    for (const [south, north, west, east] of coastalBuffers) {
      if (lat >= south && lat <= north && lng >= west && lng <= east) {
        // 70% chance to consider coastal buffers as land
        return Math.random() > 0.7;
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
    
    // Filter vessels based on current filter and map bounds
    const filteredVessels = vessels.filter(v => {
      // First apply user filter
      const matchesFilter = filter === 'all' || 
                          (filter === 'russian' ? v.isRussian : v.type === filter);
      
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
          
          const radarColor = vessel.type === 'submarine' ? 
            'rgb(255, 0, 0)' : 
            vessel.isRussian ? 'rgb(231, 76, 60)' : 'rgb(52, 152, 219)';
          
          if (isLowDetail) {
            // Simple dots for low detail level
            iconProps = {
              path: window.google.maps.SymbolPath.CIRCLE,
              fillColor: radarColor,
              fillOpacity: radarOpacity,
              strokeColor: '#FFFFFF',
              strokeWeight: 1,
              scale: vessel.type === 'submarine' ? 3 : 2,
              anchor: new window.google.maps.Point(0, 0),
            };
          } else if (isMediumDetail) {
            // Simplified arrow for medium detail
            const arrowSize = radarScale * 4;
            iconProps = {
              path: `M 0,-${arrowSize} L ${arrowSize/2},${arrowSize} L -${arrowSize/2},${arrowSize} Z`, // Simpler arrow shape
              fillColor: radarColor,
              fillOpacity: radarOpacity,
              strokeColor: '#FFFFFF',
              strokeWeight: 1,
              rotation: vessel.heading, // Rotate according to vessel heading
              scale: 1,
              anchor: new window.google.maps.Point(0, 0),
            };
          } else {
            // Full detail for high zoom levels
            const arrowSize = radarScale * 5;
            iconProps = {
              path: `M 0,-${arrowSize} L ${arrowSize/2},${arrowSize} L 0,${arrowSize/2} L -${arrowSize/2},${arrowSize} Z`, // Arrow shape
              fillColor: radarColor,
              fillOpacity: radarOpacity,
              strokeColor: '#FFFFFF',
              strokeWeight: 1,
              rotation: vessel.heading, // Rotate according to vessel heading
              scale: 1,
              anchor: new window.google.maps.Point(0, 0),
            };
          }
          break;
          
        case 'sonar':
          // Sonar mode - shows vessels as acoustic signatures
          const sonarOpacity = vessel.type === 'submarine' ? 
            0.5 + vessel.detectionProbability.sonar * 0.5 : 
            0.2 + vessel.detectionProbability.sonar * 0.8;
          
          const sonarColor = vessel.type === 'submarine' ? '#FF00FF' : '#00E5FF';
          
          if (isLowDetail) {
            // Simple dots for low detail level
            iconProps = {
              path: window.google.maps.SymbolPath.CIRCLE,
              fillColor: sonarColor,
              fillOpacity: sonarOpacity,
              strokeColor: '#FFFFFF',
              strokeWeight: 1,
              scale: vessel.type === 'submarine' ? 3 : 2,
              anchor: new window.google.maps.Point(0, 0),
            };
            
            // Simplified acoustic wave
            if (vessel.type === 'submarine') {
              const waveRadius = vessel.speed * 80;
              circleProps = {
                radius: waveRadius,
                options: {
                  fillColor: sonarColor,
                  fillOpacity: 0.03,
                  strokeColor: sonarColor,
                  strokeOpacity: 0.1,
                  strokeWeight: 1,
                }
              };
            }
          } else {
            // Use the same arrow shape as radar mode but with sonar colors
            const sonarArrowSize = vessel.type === 'submarine' ? 5 : 4;
            iconProps = {
              path: `M 0,-${sonarArrowSize} L ${sonarArrowSize/2},${sonarArrowSize} L 0,${sonarArrowSize/2} L -${sonarArrowSize/2},${sonarArrowSize} Z`, // Arrow shape
              fillColor: sonarColor,
              fillOpacity: sonarOpacity,
              strokeColor: '#FFFFFF',
              strokeWeight: 1,
              rotation: vessel.heading,
              scale: 1,
              anchor: new window.google.maps.Point(0, 0),
            };
            
            // Add acoustic wave circle - only at higher zoom levels
            if (isHighDetail) {
              const waveRadius = vessel.type === 'submarine' ? 
                Math.max(500, vessel.speed * 100) : 
                Math.max(300, vessel.speed * 60);
                
              circleProps = {
                radius: waveRadius,
                options: {
                  fillColor: sonarColor,
                  fillOpacity: 0.05,
                  strokeColor: sonarColor,
                  strokeOpacity: 0.2,
                  strokeWeight: 1,
                }
              };
            } else if (isMediumDetail && vessel.type === 'submarine') {
              const waveRadius = Math.max(300, vessel.speed * 80);
              circleProps = {
                radius: waveRadius,
                options: {
                  fillColor: sonarColor,
                  fillOpacity: 0.03,
                  strokeColor: sonarColor,
                  strokeOpacity: 0.1,
                  strokeWeight: 1,
                }
              };
            }
          }
          break;
          
        case 'fused':
          // Fused mode - combines radar and sonar data
          const fusedOpacity = 0.4 + vessel.detectionProbability.fused * 0.6;
          
          // Create color gradient based on radar/sonar detection probabilities
          const radarValue = Math.floor(vessel.detectionProbability.radar * 255);
          const sonarValue = Math.floor(vessel.detectionProbability.sonar * 255);
          const fusedColor = vessel.isRussian ? 
            `rgb(255, 100, 100)` : 
            `rgb(100, ${radarValue}, ${sonarValue})`;
          
          if (isLowDetail) {
            // Simple dots for low detail level
            iconProps = {
              path: window.google.maps.SymbolPath.CIRCLE,
              fillColor: fusedColor,
              fillOpacity: fusedOpacity,
              strokeColor: '#FFFFFF',
              strokeWeight: 1,
              scale: vessel.type === 'submarine' ? 3 : 2,
              anchor: new window.google.maps.Point(0, 0),
            };
          } else {
            // Use the same arrow shape as other modes but with fused colors
            const fusedArrowSize = 5;
            iconProps = {
              path: `M 0,-${fusedArrowSize} L ${fusedArrowSize/2},${fusedArrowSize} L 0,${fusedArrowSize/2} L -${fusedArrowSize/2},${fusedArrowSize} Z`, // Arrow shape
              fillColor: fusedColor,
              fillOpacity: fusedOpacity,
              strokeColor: '#FFFFFF',
              strokeWeight: 1,
              rotation: vessel.heading,
              scale: 1,
              anchor: new window.google.maps.Point(0, 0),
            };
          }
          
          // Add confidence circle - only at higher zoom levels
          if (isHighDetail) {
            const confidenceRadius = 300 + (1 - vessel.detectionProbability.fused) * 1000;
            circleProps = {
              radius: confidenceRadius,
              options: {
                fillColor: 'transparent',
                fillOpacity: 0,
                strokeColor: vessel.isRussian ? "#FF6B6B" : "#4285F4",
                strokeOpacity: 0.4,
                strokeWeight: 0.5,
              }
            };
          } else if (isMediumDetail && (vessel.type === 'military' || vessel.type === 'submarine')) {
            // Only show confidence circles for important vessels at medium zoom
            const confidenceRadius = 200 + (1 - vessel.detectionProbability.fused) * 800;
            circleProps = {
              radius: confidenceRadius,
              options: {
                fillColor: 'transparent',
                fillOpacity: 0,
                strokeColor: vessel.isRussian ? "#FF6B6B" : "#4285F4",
                strokeOpacity: 0.3,
                strokeWeight: 0.5,
              }
            };
          }
          break;
          
        default:
          // Default to radar mode with arrow icon
          const defaultSize = 5;
          iconProps = {
            path: `M 0,-${defaultSize} L ${defaultSize/2},${defaultSize} L 0,${defaultSize/2} L -${defaultSize/2},${defaultSize} Z`, // Arrow shape
            fillColor: '#FFFFFF',
            fillOpacity: 0.8,
            strokeColor: '#000000',
            strokeWeight: 1,
            rotation: vessel.heading,
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
            onClick={() => setSelectedVessel(vessel)}
            zIndex={isSelected ? 1000 : vessel.type === 'submarine' ? 500 : 100}
          />
          
          {circleProps.radius > 0 && (
            <MemoizedCircle
              center={position}
              radius={circleProps.radius}
              options={circleProps.options}
            />
          )}
          
          {vessel.type === 'submarine' && vessel.isSubmerged && displayMode !== 'fused' && isHighDetail && (
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
  }, [vessels, filter, isInMapBounds, selectedVessel, displayMode, currentZoom]); // Added dependencies for memoization
  
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
              onClick={() => {
                // Calculate estimated area if not provided
                let displayArea = windFarm.area;
                if (!displayArea) {
                  if (windFarm.turbines) {
                    displayArea = Math.round(windFarm.turbines * 1.0);
                  } else {
                    displayArea = Math.round(windFarm.capacity / 6.5);
                  }
                }
                
                setSelectedVessel({
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
                });
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
      const mediumVessels = vessels.filter(v => 
        (v.type === 'commercial' || v.type === 'tanker' || v.type === 'passenger') && 
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
      const largeVessels = vessels.filter(v => 
        (v.type === 'commercial' || v.type === 'tanker' || v.type === 'passenger') && 
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
    if (selectedVessel) {
      setSelectedVessel(null);
    }
  };
  
  // Get visible vessel count - memoized for sidebar display
  const visibleVesselCount = useMemo(() => 
    vessels.filter(v => {
      const matchesFilter = filter === 'all' || 
                         (filter === 'russian' ? v.isRussian : v.type === filter);
      return matchesFilter;
    }).length
  , [vessels, filter]);
  
  // Get only vessels visible in current sidebar (both filtered and in bounds) - memoized
  const displayedVessels = useMemo(() => 
    vessels.filter(v => {
      const matchesFilter = filter === 'all' || 
                          (filter === 'russian' ? v.isRussian : v.type === filter);
      
      const inBounds = isInMapBounds(v.position[1], v.position[0]);
      
      return matchesFilter && inBounds;
    }).slice(0, 50) // Still limit to 50 for performance
  , [vessels, filter, isInMapBounds]);
  
  // Memoize UI elements that don't need frequent updates
  const controlPanels = useMemo(() => (
    <>
      <div className="control-panel">
        <h2 className="text-sm font-semibold mb-2 palantir-heading">Display Mode</h2>
        <div className="flex flex-row flex-nowrap">
          <button 
            className={displayMode === 'radar' ? 'active' : ''} 
            onClick={() => setDisplayMode('radar')}
          >
            <Radar size={14} className="mr-1" />
            Radar
          </button>
          <button 
            className={displayMode === 'sonar' ? 'active' : ''} 
            onClick={() => setDisplayMode('sonar')}
          >
            <Waves size={14} className="mr-1" />
            Sonar
          </button>
          <button 
            className={displayMode === 'fused' ? 'active' : ''} 
            onClick={() => setDisplayMode('fused')}
          >
            <Layers size={14} className="mr-1" />
            Fused
          </button>
        </div>
      </div>
      
      <div className="control-panel">
        <h2 className="text-sm font-semibold mb-2 palantir-heading">Vessel Filter</h2>
        <div className="flex flex-row flex-wrap">
          <button 
            className={filter === 'all' ? 'active' : ''} 
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button 
            className={filter === 'commercial' ? 'active' : ''} 
            onClick={() => setFilter('commercial')}
          >
            Commercial
          </button>
          <button 
            className={filter === 'military' ? 'active' : ''} 
            onClick={() => setFilter('military')}
          >
            Military
          </button>
          <button 
            className={filter === 'submarine' ? 'active' : ''} 
            onClick={() => setFilter('submarine')}
          >
            Submarines
          </button>
          <button 
            className={filter === 'russian' ? 'active' : ''} 
            onClick={() => setFilter('russian')}
          >
            Russian
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
  ), [displayMode, filter, showWindFarms, showRadarCoverage, showVesselRadar, showLargeVesselRadar, simulationEnabled, simulationSpeed]);
  
  // Update UI to include display mode toggle
  return (
    <div className="baltic-tracker-container">
      <div className="flex h-screen">
        {showSidebar && (
          <div className="sidebar w-80">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-xl font-semibold palantir-heading">Baltic Sea Tracker</h1>
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
              center={defaultCenter}
              zoom={6}
              options={{
                disableDefaultUI: true,
                zoomControl: false,
                styles: getMapStyle(displayMode),
                draggable: true,
              }}
              onLoad={onMapLoad}
              onClick={handleMapClick}
              key={mapKey}
            >
              {vessels.length > 0 && renderVessels()}
              {showWindFarms && renderWindFarms()}
              {showRadarCoverage && renderRadarCoverage()}
              {(showVesselRadar || showLargeVesselRadar) && renderVesselRadarCoverage()}
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
          
          {/* Move the Reset filters button to bottom-left corner */}
          <button
            onClick={() => {
              // Reset vessel selection and visualization features
              setSelectedVessel(null);
              setShowWindFarms(false);
              setShowRadarCoverage(false);
              setShowVesselRadar(false);
              setShowLargeVesselRadar(false);
              setSimulationEnabled(false);
              
              // Reset display settings
              setDisplayMode('radar');
              setFilter('all');
              setSimulationSpeed(10);
              
              // Reset map position and zoom
              if (mapRef.current) {
                mapRef.current.setCenter(defaultCenter);
                mapRef.current.setZoom(6);
                setCurrentZoom(6);
                setCurrentMapCenter(defaultCenter);
              }
              
              // Force React to remount map components
              setMapKey(Date.now());
              
              // Small timeout to ensure map refreshes completely
              setTimeout(() => {
                if (mapRef.current && mapRef.current.overlayMapTypes) {
                  mapRef.current.overlayMapTypes.clear();
                }
              }, 10);
            }}
            style={{
              position: 'absolute',
              bottom: '10px',
              left: '10px',
              backgroundColor: '#8B0000',
              color: '#FFFFFF',
              padding: '8px 16px',
              borderRadius: '4px',
              border: 'none',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
              zIndex: 9999,
              fontSize: '14px'
            }}
          >
            Reset filters
          </button>
          
          {selectedVessel && (
            <div className="absolute top-20 right-10 control-panel" style={{ zIndex: 9000 }}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold palantir-heading">{selectedVessel.name}</h3>
                <button 
                  onClick={() => setSelectedVessel(null)} 
                  className="text-gray-400 hover:text-white"
                >
                  ×
                </button>
              </div>
              <div className="text-sm text-gray-300">
                {selectedVessel.isWindFarm ? (
                  <>
                    <div>Type: Wind Farm</div>
                    <div>Country: {selectedVessel.flag}</div>
                    <div>Capacity: {selectedVessel.capacity} MW</div>
                    {selectedVessel.turbines && <div>Turbines: {selectedVessel.turbines}</div>}
                    {selectedVessel.area && (
                      <div>
                        Area: {selectedVessel.area} km² 
                        {selectedVessel.estimatedArea && <span className="text-amber-400"> (est.)</span>}
                      </div>
                    )}
                    <div>Status: {selectedVessel.status.charAt(0).toUpperCase() + selectedVessel.status.slice(1)}</div>
                  </>
                ) : (
                  <>
                    <div>Flag: {selectedVessel.flag}</div>
                    <div>Type: {selectedVessel.type}</div>
                    {selectedVessel.class && <div>Class: {selectedVessel.class}</div>}
                    {selectedVessel.designation && <div>Designation: {selectedVessel.designation}</div>}
                    <div>Operator: {selectedVessel.operator}</div>
                    <div>Length: {selectedVessel.length}m</div>
                    <div>Speed: {selectedVessel.speed} knots</div>
                    <div>Heading: {selectedVessel.heading}°</div>
                    {selectedVessel.grossTonnage && <div>Gross Tonnage: {selectedVessel.grossTonnage} GT</div>}
                    {selectedVessel.type === 'submarine' && (
                      <div>Depth: {selectedVessel.depth}m ({selectedVessel.isSubmerged ? 'Submerged' : 'Surfaced'})</div>
                    )}
                    <div className="mt-2">Detection Confidence:</div>
                    <div className="flex items-center mt-1">
                      <span className="w-12 text-xs">Radar:</span>
                      <div className="progress-bar flex-1">
                        <div className="progress-value" style={{width: `${selectedVessel.detectionProbability.radar * 100}%`, backgroundColor: "#4285F4"}}></div>
                      </div>
                      <span className="ml-2 text-xs">{Math.round(selectedVessel.detectionProbability.radar * 100)}%</span>
                    </div>
                    <div className="flex items-center mt-1">
                      <span className="w-12 text-xs">Sonar:</span>
                      <div className="progress-bar flex-1">
                        <div className="progress-value" style={{width: `${selectedVessel.detectionProbability.sonar * 100}%`, backgroundColor: "#00E5FF"}}></div>
                      </div>
                      <span className="ml-2 text-xs">{Math.round(selectedVessel.detectionProbability.sonar * 100)}%</span>
                    </div>
                    <div className="flex items-center mt-1">
                      <span className="w-12 text-xs">Fused:</span>
                      <div className="progress-bar flex-1">
                        <div className="progress-value" style={{width: `${selectedVessel.detectionProbability.fused * 100}%`, backgroundColor: "#00C48C"}}></div>
                      </div>
                      <span className="ml-2 text-xs">{Math.round(selectedVessel.detectionProbability.fused * 100)}%</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="bg-gray-800 p-2 text-center text-sm text-gray-400">
        <div className="flex justify-center items-center">
          <Info size={16} className="mr-1 text-blue-400" />
          <span className="text-gray-300">Baltic Sea Tracker - {filter === 'all' ? 300 : vessels.filter(v => filter === 'russian' ? v.isRussian : v.type === filter).length} vessels in {displayMode} mode | Zoom: {currentZoom}</span>
          {showWindFarms && <span className="mx-1 text-amber-400">| Wind Farms Shown</span>}
          {showRadarCoverage && showWindFarms && <span className="mx-1 text-red-400">| Radar Coverage (42 NM)</span>}
          {showVesselRadar && <span className="mx-1 text-blue-400">| Vessel Radar (20/40 NM)</span>}
          {simulationEnabled && <span className="mx-1 text-green-400">| Vessel Movement ({simulationSpeed}x)</span>}
        </div>
      </div>
    </div>
  );
}

export default BalticSeaTracker;
