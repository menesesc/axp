/**
 * Texto plano de un cierre Maxirest real (Walpina S.A.S., 24/05/2026, Almuerzo, cierre #1543).
 * Pegado tal cual del PDF para usar como fixture en tests del parser.
 */
export const MAXIREST_SAMPLE_TEXT = `WALPINA S. A. S.
WALPINA S. A. S.
VICE ALTE OCONNOR 401
Sucursal: WEISS
IVA: Resp. Inscripto   CUIT: 30-71923869-2
TOTALES DEL DIA:
Domingo 24 de Mayo de 2026
Turno 1  (Almuerzo            )
Cierre nº  1543.
Apertura: 12:03 - Usuario: JOHAN
  Cierre: 16:27 - Usuario: JOHAN

MOVIMIENTOS DE CAJA
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Conc.   Detalle                    Total
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Turno: Almuerzo
INGRESOS
~~~~~~~~
VENTAS  Recaudación            1054800.00
                              ==========
        SUBTOTAL INGRESOS:    1054800.00
EGRESOS
~~~~~~~~
CAJA MA SALDO A CAJA MAYO      -866025.00
EGR.VAR PROPINA                -128775.00
EGR.VAR MEDIA JORNADA MAT      -60000.00
                              ==========
         SUBTOTAL EGRESOS:   -1054800.00

                              ==========
          TOTAL INGRESOS:    1054800.00
                              ==========
           TOTAL EGRESOS:   -1054800.00
                              ==========
           SALDO DE CAJA:          0.00






RESUMEN DE VENTAS
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Detalle                      Total Cant
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TOTAL                   3878100.00   38
Efectivo                1054800.00   14
---------------------------------------
Cta.Cte.                  19600.00    1
---------------------------------------
Tarjetas                2803700.00   27
---------------------------------------
Factura B ELECTRÓNIC    2785700.00   23
---------------------------------------
Factura B               1092400.00   15
---------------------------------------
Descuentos                    0.00    0
 1.Descuento             122400.00    9
---------------------------------------
Cubiertos Turno Almu         78.00    0
---------------------------------------
Cubiertos de Salón           78.00    0
---------------------------------------
TOTAL CUBIERTOS              78.00    0
Promedio por cubiert      46057.69    0
Salón                   3878100.00   38
Neto ACF 21.00%         3205041.32    0
Iva  ACF 21.00%          673058.68    0




VENTAS POR FORMA DE COBRO
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Forma de cobro           Total Cant
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Efectivo (*)            1054800.00   14
Cta Cte (/)               19600.00    1
Amex (A)                 397000.00    3
Visa Debito (E)          758500.00    9
Master (M)               632000.00    4
QR - MP (P)              532200.00    7
Visa (V)                 484000.00    4
                    ===============
TOTAL                   3878100.00   42
RESUMEN
--------------------
Efectivo                1054800.00    0
Cta.Cte.                  19600.00    0
Tarjetas                2803700.00    0




VENTAS POR ARTICULO
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Cód. Nombre           Unidades   Importe
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
**** CUBIERTOS        78.0     117000.00
                      ==================
          TOTAL RUBRO:78.0     117000.00
----------------------------------------
Rubro:   1 - ENTRADAS
   2 PICADA CHICA FAMI 2.0      78000.00
   3 PICADA ESTEPA PAT 1.0      60000.00
   6 EMPANADA DE CORDE10.0      55000.00
                      ==================
          TOTAL RUBRO:13.0     193000.00
----------------------------------------
Rubro:   3 - ENSALADAS
 100 ENSALADA DEL BOSQ 3.0      54000.00
                      ==================
          TOTAL RUBRO: 3.0      54000.00
----------------------------------------
Rubro:   4 - CARNE PARRILLA
 150 POLLO CON SALSA D 1.0      34000.00
 154 BIFE CHORIZO PAPA 6.0     228000.00
 157 CORDERO PATAGÓNIC 7.0     259000.00
 160 LOMO CON SALSA DE 1.0      47000.00
                      ==================
          TOTAL RUBRO:15.0     568000.00
----------------------------------------
Rubro:   5 - PESCADOS
 203 TRUCHA A LAS FINA 3.0     114000.00
 204 TRUCHA A LA CREMA 2.0      76000.00
 205 TRUCHA CON CHAMPI 4.0     160000.00
                      ==================
          TOTAL RUBRO: 9.0     350000.00
----------------------------------------
Rubro:   6 - GUARNICIONES
 256 ESPINACA A LA CRE 1.0      12000.00
 257 ARROZ             1.0       5000.00
                      ==================
          TOTAL RUBRO: 2.0      17000.00
----------------------------------------
Rubro:   7 - PLATOS TIPICOS
 300 BONDIOLA DEL CHEF 1.0      38000.00
 302 MILANESA WEISS    2.0      70000.00
 303 CORDERO A LA CAZA 4.0     152000.00
 304 GOULASH CON SPARZ 4.0     136000.00
 305 CIERVO A LA CAZAD 5.0     200000.00
 306 MILANESA CON GUAR 3.0      90000.00
 307 CORDERO RELLENO C 2.0      84000.00
 354 LOCRO            15.0     302400.00
                      ==================
          TOTAL RUBRO:36.0    1072400.00
----------------------------------------
Rubro:   8 - MENU INFANTIL
 353 MI BIFE           2.0      64000.00
                      ==================
          TOTAL RUBRO: 2.0      64000.00
----------------------------------------
Rubro:   9 - PASTAS CASERAS
 400 FETUCCINI         1.0      14000.00
 401 ÑOQUIS RELLENOS   6.0     150000.00
 403 SORRENTINOS DE VE 7.0     147000.00
 404 SORRENTINOS SALMÓ 4.0     108000.00
 405 LASAGNA DE CORDER 1.0      34000.00
                      ==================
          TOTAL RUBRO:19.0     453000.00
----------------------------------------
Rubro:  10 - SALSAS
 451 SALSA CREMA       1.0       6000.00
 452 SALSA FILETTO     1.0       5000.00
 453 SALSA HONGOS      5.0      35000.00
 454 SALSA BELLA LTALI 4.0      48000.00
 455 SALSA BOLOGNESA   3.0      27000.00
 456 SALSA ROSA        4.0      24000.00
 457 SIN SALSA         1.0          0.00
                      ==================
          TOTAL RUBRO:19.0     145000.00
----------------------------------------
Rubro:  11 - POSTRES
 502 CREEPE DULCE LECH 1.0       9000.00
 503 PANQUEQUE DE MANZ 1.0      11000.00
 508 HELADO SALSA FRAM 1.0      13000.00
 521 FLAN CON CREMA O  2.0      17000.00
 524 TIRAMISU          2.0      30000.00
 525 HELADO MENU INFAN 2.0          0.00
                      ==================
          TOTAL RUBRO: 9.0      80000.00
----------------------------------------
Rubro:  13 - APERITIVOS
 602 CAIPIRINHA- CAIPI 2.0      32000.00
 603 DAIKIRI           1.0      16000.00
 606 FERNET BRANCA CON 2.0      36000.00
 609 APPEROL           2.0      18000.00
                      ==================
          TOTAL RUBRO: 7.0     102000.00
----------------------------------------
Rubro:  14 - CERVEZAS
 650 IMPERIAL LITRO    2.0      26000.00
 655 PINTA RU GOLDEN  11.0      82500.00
 656 PINTA RJ SCOTISH  4.0      30000.00
 657 PINTA NE PORTER   1.0       7500.00
                      ==================
          TOTAL RUBRO:18.0     146000.00
----------------------------------------
Rubro:  15 - BEBIDAS S/A
 700 AGUA MINERAL CON 11.0      44000.00
 701 AGUA MINERAL SIN 19.0      76000.00
 704 JUGOS NATURALES   2.0      20000.00
 707 COCA COLA         7.0      31500.00
 708 COCA ZERO         7.0      31500.00
 709 SPRITE            2.0       9000.00
 711 SWP TONICA        1.0       4500.00
 712 SWP POMELO        2.0       9000.00
 713 SAB MANZANA       1.0       4500.00
 714 SAB PERA          1.0       4500.00
 715 SAB LIMONADA      1.0       4500.00
 716 SAB POMELO        4.0      18000.00
 718 JUGO LIMON-JENG   1.0      10000.00
1001 CAFE              4.0      12000.00
1003 CAFE DOBLE        1.0       4500.00
                      ==================
          TOTAL RUBRO:64.0     283500.00
----------------------------------------
Rubro:  16 - VINOS
 706 COPA DE VINO      5.0      40000.00
 764 SAINT FELICIEN MA 1.0      17000.00
 809 SANTA JULIA CHENI 1.0      18000.00
 824 PORTILLO SAUVIGNO 1.0      16000.00
 826 FIN MALBEC        1.0      58000.00
 867 LAS PERDICES RES  1.0      21000.00
 872 LAS PERDICES MALB 2.0      27200.00
 880 DIAMANDES DE UCO  1.0      36000.00
                      ==================
          TOTAL RUBRO:13.0     233200.00
                      ==================
              TOTALES: 307    3878100.00




VENTAS POR EMPLEADO
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Cód Nombre             Importe Vtas Cub.
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 101 ANDRES          1465500.00   17   25
 102 MIGUEL           501500.00    6   11
 103 MARCELO          776500.00    7   16
 109 LUIS PALACIO    1134600.00    8   26
                    ====================
          TOTAL:    3878100.00   38   78




AUDITORIA
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Detalle
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Usuario: JOHAN
Fecha 24/05/2026 Turno 1
** FIN AUDITORIA **`
