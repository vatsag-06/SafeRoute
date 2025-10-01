import React, { useState } from "react";
import {
  View,
  TextInput,
  Button,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Image,
} from "react-native";
import MapView, { Polyline, Marker, Region } from "react-native-maps";
import { LinearGradient } from "expo-linear-gradient";

type LatLng = { latitude: number; longitude: number };

interface RouteResult {
  shortest_distance_m: number;
  safest_distance_m: number;
  safest_score: number;
  shortest_route: LatLng[];
  safest_route: LatLng[];
}

const BACKEND_LAN = "http://192.168.1.130:8000";
const BACKEND_ANDROID_EMULATOR = "http://10.0.2.2:8000";

const BASE_URL =
  Platform.OS === "android" ? BACKEND_ANDROID_EMULATOR : BACKEND_LAN;

export default function App() {
  const [origin, setOrigin] = useState("UC Irvine");
  const [dest, setDest] = useState("Irvine Spectrum Center");
  const [result, setResult] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const getRoute = async () => {
    setErr(null);
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch(`${BASE_URL}/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin,
          destination: dest,
          alpha: 1.5,
          beta: 0.7,
          use_weather: false,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`${res.status} ${res.statusText} – ${txt}`);
      }

      const data = (await res.json()) as RouteResult;
      setResult(data);
    } catch (e: any) {
      setErr(e?.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  const initialRegionFor = (coords: LatLng[] | undefined): Region => {
    const center =
      coords && coords.length
        ? coords[0]
        : { latitude: 33.64, longitude: -117.84 };
    return {
      latitude: center.latitude,
      longitude: center.longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  };

  return (
    <LinearGradient colors={["#4facfe", "#00f2fe"]} style={styles.background}>
      <View style={styles.container}>
        <Image
          source={require("./assets/Logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.title}>SafeRoute</Text>
        <TextInput
          style={styles.input}
          placeholder="Origin"
          value={origin}
          onChangeText={setOrigin}
        />
        <TextInput
          style={styles.input}
          placeholder="Destination"
          value={dest}
          onChangeText={setDest}
        />

        <Button
          title={loading ? "Finding route..." : "Get Route"}
          onPress={getRoute}
          disabled={loading}
          color="#007BFF"
        />
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="white" />
            <Text style={styles.loadingText}>Finding the best route…</Text>
          </View>
        )}

        {err && (
          <Text style={{ marginTop: 12, color: "red", textAlign: "center" }}>
            {err}
          </Text>
        )}



        {result && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardText}>
                🛣 Shortest: {Math.round(result.shortest_distance_m)} m
              </Text>
              <Text style={styles.cardText}>
                ✅ Safest: {Math.round(result.safest_distance_m)} m
              </Text>
              <Text style={styles.cardText}>
                📊 Score: {Math.round(result.safest_score)}
              </Text>
            </View>

            <View style={styles.mapContainer}>
              <MapView
                style={styles.map}
                initialRegion={initialRegionFor(result.shortest_route)}
              >
                <Polyline
                  coordinates={result.shortest_route}
                  strokeColor="blue"
                  strokeWidth={6}
                />

                <Polyline
                  coordinates={result.safest_route}
                  strokeColor="green"
                  strokeWidth={2}
                  lineDashPattern={[4, 4]}
                />
                <Marker coordinate={result.shortest_route[0]} title="Origin" />
                <Marker
                  coordinate={
                    result.shortest_route[result.shortest_route.length - 1]
                  }
                  title="Destination"
                />
              </MapView>
              <View style={styles.legend}>
                <View style={styles.legendRow}>
                  <View
                    style={[styles.colorBox, { backgroundColor: "blue" }]}
                  />
                  <Text>Shortest Route</Text>
                </View>
                <View style={styles.legendRow}>
                  <View
                    style={[
                      styles.colorBox,
                      {
                        borderColor: "green",
                        borderWidth: 2,
                        backgroundColor: "transparent",
                      },
                    ]}
                  />
                  <Text>Safest Route</Text>
                </View>
              </View>
            </View>
          </>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  container: { flex: 1, paddingTop: 40, paddingHorizontal: 16 },
  logo: {
    width: 120,
    height: 120,
    alignSelf: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    color: "white",
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    backgroundColor: "white",
  },
  card: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "white",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  cardText: { fontSize: 16, marginBottom: 4 },
  mapContainer: {
    marginTop: 16,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  map: { height: 320 },
  legend: {
    position: "absolute",
    bottom: 12,
    left: 12,
    backgroundColor: "white",
    padding: 8,
    borderRadius: 6,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  legendRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  colorBox: { width: 20, height: 6, marginRight: 6 },
  loadingOverlay: {
    position: "absolute",
    top: "40%",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
});
