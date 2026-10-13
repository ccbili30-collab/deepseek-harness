// Voronoi diagram on top of Delaunator half-edges.
// Ported from Azgaar's Fantasy-Map-Generator (MIT).
import Delaunator from "delaunator";
import type { Point, VoronoiCells, VoronoiVertices } from "./types.ts";

export class Voronoi {
  delaunay: Delaunator<Float64Array>;
  points: Point[];
  pointsN: number;
  cells: VoronoiCells = { v: [], c: [], b: [], i: new Uint32Array() };
  vertices: VoronoiVertices = { p: [], v: [], c: [] };

  constructor(delaunay: Delaunator<Float64Array>, points: Point[], pointsN: number) {
    this.delaunay = delaunay;
    this.points = points;
    this.pointsN = pointsN;

    for (let e = 0; e < this.delaunay.triangles.length; e++) {
      const p = this.delaunay.triangles[this.nextHalfedge(e)];
      if (p < this.pointsN && !this.cells.c[p]) {
        const edges = this.edgesAroundPoint(e);
        this.cells.v[p] = edges.map(e => this.triangleOfEdge(e)); // cell: adjacent vertex
        this.cells.c[p] = edges.map(e => this.delaunay.triangles[e]).filter(c => c < this.pointsN); // cell: adjacent valid cells
        this.cells.b[p] = edges.length > this.cells.c[p].length ? 1 : 0; // cell: is border
      }

      const t = this.triangleOfEdge(e);
      if (!this.vertices.p[t]) {
        this.vertices.p[t] = this.triangleCenter(t); // vertex: coordinates
        this.vertices.v[t] = this.trianglesAdjacentToTriangle(t); // vertex: adjacent vertices
        this.vertices.c[t] = this.pointsOfTriangle(t); // vertex: adjacent cells
      }
    }
  }

  private pointsOfTriangle(triangleIndex: number): [number, number, number] {
    return this.edgesOfTriangle(triangleIndex).map(edge => this.delaunay.triangles[edge]) as [number, number, number];
  }

  private trianglesAdjacentToTriangle(triangleIndex: number): number[] {
    const triangles = [];
    for (const edge of this.edgesOfTriangle(triangleIndex)) {
      const opposite = this.delaunay.halfedges[edge];
      triangles.push(this.triangleOfEdge(opposite));
    }
    return triangles;
  }

  private edgesAroundPoint(start: number): [number, number, number] {
    const result = [];
    let incoming = start;
    do {
      result.push(incoming);
      const outgoing = this.nextHalfedge(incoming);
      incoming = this.delaunay.halfedges[outgoing];
    } while (incoming !== -1 && incoming !== start && result.length < 20);
    return result as [number, number, number];
  }

  private triangleCenter(triangleIndex: number): Point {
    const vertices = this.pointsOfTriangle(triangleIndex).map(p => this.points[p]);
    return this.circumcenter(vertices[0], vertices[1], vertices[2]);
  }

  private edgesOfTriangle(triangleIndex: number): [number, number, number] {
    return [3 * triangleIndex, 3 * triangleIndex + 1, 3 * triangleIndex + 2];
  }

  private triangleOfEdge(e: number): number {
    return Math.floor(e / 3);
  }

  private nextHalfedge(e: number): number {
    return e % 3 === 2 ? e - 2 : e + 1;
  }

  private circumcenter(a: Point, b: Point, c: Point): Point {
    const [ax, ay] = a;
    const [bx, by] = b;
    const [cx, cy] = c;
    const ad = ax * ax + ay * ay;
    const bd = bx * bx + by * by;
    const cd = cx * cx + cy * cy;
    const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    return [
      (1 / D) * (ad * (by - cy) + bd * (cy - ay) + cd * (ay - by)),
      (1 / D) * (ad * (cx - bx) + bd * (ax - cx) + cd * (bx - ax))
    ];
  }
}

/** build the Voronoi diagram; boundary pseudo-points clip the outer cells but get no cells */
export const calculateVoronoi = (
  points: Point[],
  boundary: Point[]
): { cells: VoronoiCells; vertices: VoronoiVertices } => {
  const allPoints = points.concat(boundary);
  const delaunay = Delaunator.from(allPoints);
  const { cells, vertices } = new Voronoi(delaunay, allPoints, points.length);
  cells.i = Uint32Array.from({ length: points.length }, (_, i) => i);
  return { cells, vertices };
};
