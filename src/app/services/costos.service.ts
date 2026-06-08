import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CostoRegistro {
  id?: number;
  descripcion: string;
  tipo_registro: 'carrusel' | 'pregunta' | 'respuesta';
  fecha?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CostosService {
  private apiUrl = '/api/costos';
  private clearUrl = '/api/clear';

  constructor(private http: HttpClient) {}

  // Obtener los registros, opcionalmente filtrando por tipo
  getCostos(tipo?: string): Observable<CostoRegistro[]> {
    const url = tipo ? `${this.apiUrl}?tipo=${tipo}` : this.apiUrl;
    return this.http.get<CostoRegistro[]>(url);
  }

  // Registrar un nuevo costo o mensaje
  addCosto(descripcion: string, tipoRegistro: 'carrusel' | 'pregunta' | 'respuesta' = 'carrusel'): Observable<CostoRegistro> {
    return this.http.post<CostoRegistro>(this.apiUrl, {
      descripcion,
      tipo_registro: tipoRegistro
    });
  }

  // Resetear la base de datos
  clearDatabase(): Observable<any> {
    return this.http.post<any>(this.clearUrl, {});
  }
}
