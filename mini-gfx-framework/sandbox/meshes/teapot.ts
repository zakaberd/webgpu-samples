import teapotData from './teapotData';
import { computeSurfaceNormals } from './utils';

export const mesh = {
  positions: teapotData.positions.map((position) =>
    [...position] as [number, number, number]
  ),
  triangles: teapotData.cells.map((cell) => [...cell] as [number, number, number]),
  normals: [] as [number, number, number][],
};

// Compute surface normals
mesh.normals = computeSurfaceNormals(mesh.positions, mesh.triangles);
