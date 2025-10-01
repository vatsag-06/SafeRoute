from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os, math, requests, random
import pandas as pd
import osmnx as ox
import networkx as nx

app = FastAPI(title="SafeRoute API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def generate_fake_points(center=(33.6405, -117.8443), n=50):
    lat_c, lon_c = center
    return [(lat_c + random.uniform(-0.05, 0.05),
             lon_c + random.uniform(-0.05, 0.05)) for _ in range(n)]

try:
    CRIME_DATA = pd.read_csv("Crime.csv")
    CRIME_POINTS = CRIME_DATA[["lat", "lon"]].to_numpy().tolist()
    print("success")
except Exception:
    print("failure")
    CRIME_POINTS = generate_fake_points()

class RouteRequest(BaseModel):
    origin: str
    destination: str
    alpha: float = 1.5
    beta: float = 0.7
    use_weather: bool = False

def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dlmb/2)**2
    return 2*R*math.asin(math.sqrt(a))

def fetch_weather_penalty(lat, lon):
    key = os.getenv("OPENWEATHER_API_KEY")
    if not key:
        return 0.0
    try:
        r = requests.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={"lat": lat, "lon": lon, "appid": key, "units": "metric"},
            timeout=5,
        )
        data = r.json()
        wind = float(data.get("wind", {}).get("speed", 0.0) or 0.0)
        rain = float(data.get("rain", {}).get("1h", 0.0) or 0.0)
        return min(10.0, 0.2 * wind + 2.0 * rain)
    except Exception:
        return 0.0

def path_to_coords(G, path):
    return [{"latitude": G.nodes[n]["y"], "longitude": G.nodes[n]["x"]} for n in path]

@app.get("/")
def root():
    return {"message": "SafeRoute API running. Use /docs to test."}

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/route")
def get_route(req: RouteRequest):
    try:
        lat_o, lon_o = ox.geocode(req.origin)
        lat_d, lon_d = ox.geocode(req.destination)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Geocoding failed: {e}")

    direct_m = haversine_m(lat_o, lon_o, lat_d, lon_d)
    if direct_m > 20000:
        raise HTTPException(
            status_code=413,
            detail="Route too long (>20 km). Try closer points for demo."
        )

    pad = 0.005
    north = max(lat_o, lat_d) + pad
    south = min(lat_o, lat_d) - pad
    east  = max(lon_o, lon_d) + pad
    west  = min(lon_o, lon_d) - pad

    try:
        G = ox.graph_from_bbox(bbox=(north, south, east, west), network_type="drive")
        G = ox.add_edge_speeds(G)
        G = ox.add_edge_travel_times(G)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OSM graph build failed: {e}")

    try:
        src = ox.distance.nearest_nodes(G, lon_o, lat_o)
        dst = ox.distance.nearest_nodes(G, lon_d, lat_d)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Nearest node lookup failed: {e}")

    weather_pen = fetch_weather_penalty(lat_o, lon_o) if req.use_weather else 0.0

    try:
        short_path = nx.astar_path(G, src, dst, weight="length")
        short_len = nx.path_weight(G, short_path, weight="length")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"A* shortest failed: {e}")

    H = G.copy()
    for u, v, k, data in H.edges(keys=True, data=True):
        base = float(data.get("length", 1.0))
        crime_p = 0.0
        lat_c = (G.nodes[u]["y"] + G.nodes[v]["y"]) / 2
        lon_c = (G.nodes[u]["x"] + G.nodes[v]["x"]) / 2
        for la, lo in CRIME_POINTS:
            if haversine_m(lat_c, lon_c, la, lo) <= 120.0:
                crime_p += 0.25
        crime_p = min(5.0, crime_p)
        data["safe_weight"] = base + req.alpha * crime_p + req.beta * weather_pen

    try:
        safe_path = nx.astar_path(H, src, dst, weight="safe_weight")
        safe_len = nx.path_weight(G, safe_path, weight="length")
        safe_score = nx.path_weight(H, safe_path, weight="safe_weight")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"A* safest failed: {e}")

    return {
        "shortest_distance_m": round(short_len, 2),
        "safest_distance_m": round(safe_len, 2),
        "safest_score": round(safe_score, 2),
        "shortest_route": path_to_coords(G, short_path),
        "safest_route": path_to_coords(G, safe_path),
    }

