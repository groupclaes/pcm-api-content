import { FastifyReply, FastifyRequest } from 'fastify'
import { createReadStream } from 'node:fs'

export default class Tools {
  private static readonly companies: string[] = [
    'dis',
    'bra'
  ]

  private static readonly objectTypes: string[] = [
    'artikel'
  ]

  private static readonly documentTypes: string[] = [
    'foto',
    'datasheet',
    'technische-fiche'
  ]

  private static readonly languages: string[] = [
    'nl',
    'fr'
  ]

  /**
   * check whether to do additional lookup in company `ALG`
   * @param company {string} eg; 'dis', 'bra'
   * @param objectType {string} eg; 'artikel', 'website'
   * @param documentType {string} eg; 'foto', 'datasheet'
   * @returns {boolean} true if `ALG` lookup is required, false otherwise
   */
  public static shouldFindCommon(company: string, objectType: string, documentType: string): boolean {
    return this.companies.includes(company) &&
      this.objectTypes.includes(objectType) &&
      this.documentTypes.includes(documentType)
  }

  public static shouldModifyPDF(document: any): boolean {
    return document.objectType === 'artikel' &&
      (
        document.documentType === 'datasheet' ||
        document.documentType === 'technische-fiche'
      ) &&
      document.mimeType === 'application/pdf' &&
      (
        document.companyId === 4 ||
        document.companyId === 8 ||
        (
          document.companyId === 2 &&
          (
            (
              document.objectId < 1500000000 ||
              document.objectId > 1509999999
            ) || (
              document.objectId >= 1500000000 &&
              document.objectId <= 1509999999 &&
              document.lastChanged >= new Date(2022, 9, 1)
            )
          )
        )
      )
  }

  public static resolveCompany(request: FastifyRequest): 'dis' | 'gro' | 'mac' | 'bra' {
    let ref: string = request.headers.referer
    if (ref) {
      if (ref.includes('claes-machines.be'))
        return 'mac'
      if (ref.includes('groupclaes.be'))
        return 'gro'
      if (ref.includes('brabopak.com'))
        return 'bra'
    }
    return 'dis'
  }

  /**
   * return process `uptime in seconds` when no start time is specified,
   * when start time is specified it returns the `elapsed time` between start time and now.
   * @param {number} `start` start time in seconds
   * @returns {number} returns time in seconds
   */
  public static clock(start?: number): number {
    if (!start) return process.uptime()
    const end: number = process.uptime()
    return Math.round((end - start) * 1000)
  }

  public static send404Image(request: FastifyRequest, reply: FastifyReply, culture: string = 'nl'): FastifyReply {
    let _fn_404: string = './assets/404.png'
    // If browser supports svg use vector image to save bandwidth and improve clarity.
    if (request.headers.accept && request.headers.accept.indexOf('image/svg+xml') > -1) {
      _fn_404 = './assets/404.svg'
      reply.type('image/svg+xml')
    } else
      reply.type('image/png')
    // If culture is supported use culture specific image.
    if (this.languages.includes(culture))
      _fn_404 = _fn_404.replace('/404', '/404_' + culture)
    return reply
      .send(createReadStream(_fn_404))
  }
}