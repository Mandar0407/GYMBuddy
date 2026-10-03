"""Trace a monochrome logo into a compact SVG path, without runtime dependencies.

Input is an 8-bit square grayscale raster produced by ImageMagick. White is
background; dark artwork is foreground. Output is geometry only, not app code.
"""
import argparse
import json
import math
from pathlib import Path


def simplify(points, tolerance):
    if len(points) < 3:
        return points
    ax, ay = points[0]
    bx, by = points[-1]
    length = math.hypot(bx - ax, by - ay)
    distances = [
        abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / length
        if length else math.hypot(x - ax, y - ay)
        for x, y in points
    ]
    index = max(range(len(points)), key=distances.__getitem__)
    if distances[index] <= tolerance:
        return [points[0], points[-1]]
    return simplify(points[:index + 1], tolerance)[:-1] + simplify(points[index:], tolerance)


def trace(data, size):
    if len(data) != size * size:
        raise ValueError("Input must contain exactly size × size 8-bit grayscale pixels")
    occupied = {
        (x, y) for y in range(size) for x in range(size)
        if data[y * size + x] < 128
    }
    if not occupied:
        raise ValueError("No dark artwork found")
    edges = {}

    def edge(start, end):
        edges.setdefault(start, []).append(end)

    for x, y in sorted(occupied):
        if (x, y - 1) not in occupied:
            edge((x, y), (x + 1, y))
        if (x + 1, y) not in occupied:
            edge((x + 1, y), (x + 1, y + 1))
        if (x, y + 1) not in occupied:
            edge((x + 1, y + 1), (x, y + 1))
        if (x - 1, y) not in occupied:
            edge((x, y + 1), (x, y))

    loops = []
    directions = {(1, 0): 0, (0, 1): 1, (-1, 0): 2, (0, -1): 3}
    while edges:
        start = next(iter(edges))
        point, previous, polygon = start, None, [start]
        while True:
            choices = edges[point]
            if previous is None or len(choices) == 1:
                following = choices[0]
            else:
                old_direction = directions[(point[0] - previous[0], point[1] - previous[1])]
                def priority(candidate):
                    direction = directions[(candidate[0] - point[0], candidate[1] - point[1])]
                    turn = (direction - old_direction) % 4
                    return {1: 0, 0: 1, 3: 2, 2: 3}[turn]
                following = min(choices, key=priority)
            choices.remove(following)
            if not choices:
                del edges[point]
            previous, point = point, following
            polygon.append(point)
            if point == start:
                break
        area = abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(polygon, polygon[1:]))) / 2
        if area < 6:
            continue
        farthest = max(range(len(polygon) - 1), key=lambda i: math.dist(start, polygon[i]))
        polygon = simplify(polygon[:farthest + 1], .7)[:-1] + simplify(polygon[farthest:], .7)
        loops.append(polygon)

    xmin = min(x for x, _ in occupied)
    xmax = max(x for x, _ in occupied) + 1
    ymin = min(y for _, y in occupied)
    ymax = max(y for _, y in occupied) + 1
    scale = 56 / max(xmax - xmin, ymax - ymin)
    cx, cy = (xmin + xmax) / 2, (ymin + ymax) / 2
    def coordinates(point):
        return f"{32 + (point[0] - cx) * scale:.2f} {32 + (point[1] - cy) * scale:.2f}"
    glyph = "".join("M" + coordinates(loop[0]) + "".join("L" + coordinates(p) for p in loop[1:-1]) + "Z" for loop in loops)
    return {"path": glyph, "fillRule": "evenodd", "contours": len(loops)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--size", type=int, default=768)
    args = parser.parse_args()
    result = trace(Path(args.input).read_bytes(), args.size)
    Path(args.output).write_text(json.dumps(result))
    print(f"Traced {result['contours']} contours; {len(result['path'])} SVG path characters")