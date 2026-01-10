/**
 * Lattice Code Identity Screen
 * 
 * Displays the user's quantum identity using the Lattice Code visual system.
 * Can be used to share identity or verify device registration.
 */

import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Import Lattice Code from mobile SDK
import {
  LatticeCodeRenderer,
  createLatticeCodeState,
  generateNonce,
  LatticeCodeState,
  CANVAS_SIZE,
} from '@estream/react-native';

// For web canvas rendering in React Native, we'll use a custom WebView approach
// or react-native-canvas. For now, we render using React Native SVG.
import Svg, { Circle, Path, G, Text as SvgText, Defs, RadialGradient, Stop } from 'react-native-svg';

interface LatticeCodeScreenProps {
  publicKey?: Uint8Array;
  displayName?: string;
  onClose?: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DISPLAY_SIZE = Math.min(SCREEN_WIDTH - 60, 300);

export function LatticeCodeScreen({ publicKey, displayName, onClose }: LatticeCodeScreenProps) {
  const [state, setState] = useState<LatticeCodeState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef(Date.now());
  
  useEffect(() => {
    // Create state from public key
    if (publicKey && publicKey.length > 0) {
      const latticeState = createLatticeCodeState({
        pubkey: publicKey,
        data: new TextEncoder().encode(displayName || 'eStream Identity'),
        timestamp: Date.now(),
        nonce: generateNonce(),
      });
      setState(latticeState);
    } else {
      // Demo mode with mock pubkey
      const demoPubkey = new Uint8Array(2592);
      for (let i = 0; i < demoPubkey.length; i++) {
        demoPubkey[i] = (i * 7 + 42) % 256;
      }
      const latticeState = createLatticeCodeState({
        pubkey: demoPubkey,
        data: new TextEncoder().encode('Demo Identity'),
        timestamp: Date.now(),
        nonce: generateNonce(),
      });
      setState(latticeState);
    }
  }, [publicKey, displayName]);
  
  // Animation loop
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 50); // 20 FPS
    
    return () => clearInterval(interval);
  }, []);
  
  if (!state) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loadingText}>Loading identity...</Text>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>◆ Quantum Identity</Text>
        <Text style={styles.subtitle}>Post-Quantum Secured (ML-DSA-87)</Text>
      </View>
      
      <View style={styles.latticeContainer}>
        <LatticeCodeSvg state={state} elapsed={elapsed} size={DISPLAY_SIZE} />
      </View>
      
      <View style={styles.infoContainer}>
        <Text style={styles.nameText}>{displayName || 'eStream Identity'}</Text>
        <Text style={styles.keyText}>
          pk_{publicKey ? toHex(publicKey.slice(0, 4)) : 'demo'}...
          {publicKey ? toHex(publicKey.slice(-4)) : 'demo'}
        </Text>
        <Text style={styles.securityText}>NIST Level 5 · 12 Quantum Particles</Text>
      </View>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.shareButton} onPress={() => handleShare()}>
          <Text style={styles.buttonText}>Share Identity</Text>
        </TouchableOpacity>
        
        {onClose && (
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

// SVG-based Lattice Code renderer for React Native
function LatticeCodeSvg({ state, elapsed, size }: { 
  state: LatticeCodeState; 
  elapsed: number;
  size: number;
}) {
  const scale = size / 300;
  const CENTER = 150;
  const hue = (state.baseHue + (elapsed / 100) % 360) % 360;
  
  // Get particle positions
  const particles = state.particles.map((p, i) => {
    const t = elapsed / 1000;
    const angle = p.phase + t * p.orbitSpeed * p.direction;
    let x = Math.cos(angle) * p.orbitRadius;
    let y = Math.sin(angle) * p.orbitRadius;
    x += Math.sin(t * p.pulseFrequency) * state.latticeVector[i % 8] * 5;
    y += Math.cos(t * p.pulseFrequency) * state.latticeVector[(i + 4) % 8] * 5;
    return { x: x + CENTER, y: y + CENTER, color: p.color };
  });
  
  // Hexagon centers
  const hexCenters = getHexCenters(CENTER);
  const heartbeat = (Math.sin(elapsed / 1000 * state.heartbeatFreq * Math.PI * 2) + 1) / 2;
  
  return (
    <Svg width={size} height={size} viewBox="0 0 300 300">
      {/* Background */}
      <Defs>
        <RadialGradient id="bg-gradient" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#0f1520" />
          <Stop offset="100%" stopColor="#050810" />
        </RadialGradient>
      </Defs>
      <Circle cx={CENTER} cy={CENTER} r={150} fill="url(#bg-gradient)" />
      
      {/* Timing ring */}
      <TimingRing elapsed={elapsed} hue={hue} ringSpeed={state.ringSpeed} />
      
      {/* Hexagonal grid */}
      {hexCenters.map((center, i) => (
        <Hexagon
          key={`hex-${i}`}
          cx={center.x}
          cy={center.y}
          radius={16}
          state={state.hexCells[i] || 0}
          hue={hue}
          elapsed={elapsed}
          index={i}
          heartbeat={i === 0 ? heartbeat : 0}
        />
      ))}
      
      {/* Particles */}
      {particles.map((p, i) => (
        <G key={`particle-${i}`}>
          <Circle
            cx={p.x}
            cy={p.y}
            r={8}
            fill={p.color}
            opacity={0.3}
          />
          <Circle
            cx={p.x}
            cy={p.y}
            r={4}
            fill="#ffffff"
          />
        </G>
      ))}
      
      {/* Center text */}
      <SvgText
        x={CENTER}
        y={CENTER + 4}
        textAnchor="middle"
        fill={`hsl(${hue}, 70%, 70%)`}
        fontSize={10}
        fontFamily="monospace"
      >
        ◆ eStream ◆
      </SvgText>
    </Svg>
  );
}

function TimingRing({ elapsed, hue, ringSpeed }: { 
  elapsed: number; 
  hue: number;
  ringSpeed: number;
}) {
  const CENTER = 150;
  const angle = (elapsed / 1000) * ringSpeed;
  
  const markers = Array(8).fill(0).map((_, i) => {
    const markerAngle = angle + (i / 8) * Math.PI * 2;
    const x1 = CENTER + Math.cos(markerAngle) * 130;
    const y1 = CENTER + Math.sin(markerAngle) * 130;
    const x2 = CENTER + Math.cos(markerAngle) * 145;
    const y2 = CENTER + Math.sin(markerAngle) * 145;
    return { x1, y1, x2, y2, opacity: 0.5 + Math.sin(angle * 2 + i) * 0.3 };
  });
  
  return (
    <G>
      <Circle
        cx={CENTER}
        cy={CENTER}
        r={130}
        stroke={`hsla(${hue}, 70%, 50%, 0.3)`}
        strokeWidth={2}
        fill="none"
      />
      <Circle
        cx={CENTER}
        cy={CENTER}
        r={145}
        stroke={`hsla(${hue}, 70%, 50%, 0.3)`}
        strokeWidth={2}
        fill="none"
      />
      {markers.map((m, i) => (
        <Path
          key={`marker-${i}`}
          d={`M${m.x1},${m.y1} L${m.x2},${m.y2}`}
          stroke={`hsla(${hue}, 70%, 60%, ${m.opacity})`}
          strokeWidth={3}
        />
      ))}
    </G>
  );
}

function Hexagon({ cx, cy, radius, state, hue, elapsed, index, heartbeat }: {
  cx: number;
  cy: number;
  radius: number;
  state: number;
  hue: number;
  elapsed: number;
  index: number;
  heartbeat: number;
}) {
  const points = Array(6).fill(0).map((_, i) => {
    const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
    return `${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`;
  }).join(' ');
  
  let fillColor: string;
  let fillOpacity = 0.8;
  
  if (heartbeat > 0) {
    fillColor = `hsl(${hue}, 90%, ${40 + heartbeat * 30}%)`;
    fillOpacity = 1;
  } else if (state === 0) {
    fillColor = `hsl(${hue}, 30%, 15%)`;
  } else if (state === 1) {
    fillColor = `hsl(${hue}, 80%, 50%)`;
  } else {
    const pulse = Math.sin(elapsed / 200 + index) * 0.5 + 0.5;
    fillColor = `hsl(${hue}, 80%, ${30 + pulse * 40}%)`;
  }
  
  return (
    <Path
      d={`M${points.split(' ').join(' L')} Z`}
      fill={fillColor}
      fillOpacity={fillOpacity}
      stroke={`hsla(${hue}, 60%, 40%, 0.6)`}
      strokeWidth={1}
    />
  );
}

function getHexCenters(center: number): Array<{ x: number; y: number }> {
  const centers: Array<{ x: number; y: number }> = [];
  const spacing = 18 * 1.8;
  
  centers.push({ x: center, y: center });
  
  for (let ring = 1; ring <= 3; ring++) {
    const count = ring * 6;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const radius = ring * spacing;
      centers.push({
        x: center + Math.cos(angle) * radius,
        y: center + Math.sin(angle) * radius,
      });
    }
  }
  
  return centers;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function handleShare() {
  // TODO: Implement share functionality
  console.log('Share identity');
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050810',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#00ffd5',
  },
  subtitle: {
    fontSize: 12,
    color: '#8899aa',
    marginTop: 4,
  },
  latticeContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 200, 0.2)',
    backgroundColor: '#0a0f18',
  },
  infoContainer: {
    alignItems: 'center',
    marginTop: 24,
  },
  nameText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
  },
  keyText: {
    fontSize: 12,
    color: '#5a6b7d',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 8,
  },
  securityText: {
    fontSize: 11,
    color: '#00ffd5',
    marginTop: 4,
  },
  buttonContainer: {
    marginTop: 32,
    width: '100%',
    gap: 12,
  },
  shareButton: {
    backgroundColor: '#00ffd5',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#050810',
  },
  closeButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3a4b5d',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#8899aa',
  },
  loadingText: {
    color: '#8899aa',
    fontSize: 16,
  },
});

export default LatticeCodeScreen;
