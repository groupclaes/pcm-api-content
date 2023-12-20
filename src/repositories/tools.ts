import { FastifyRequest } from "fastify"

export default class Tools {
  private static companies = [
    'gro',
    'bra'
  ]

  private static objectTypes = [
    'artikel'
  ]

  private static documentTypes = [
    'foto',
    'datasheet',
    'technische-fiche'
  ]

  /**
   * check wether or not to do additional lookup in company `ALG`
   * @param company {string} eg; 'gro', 'bra'
   * @param objectType {string} eg; 'artikel', 'website'
   * @param documentType {string} eg; 'foto', 'datasheet'
   * @returns {boolean} true if `ALG` lookup is required, false otherwise
   */
  static shouldFindCommon = (company: string, objectType: string, documentType: string): boolean =>
    Tools.companies.includes(company) &&
    Tools.objectTypes.includes(objectType) &&
    Tools.documentTypes.includes(documentType)

  static shouldModifyPDF = (document: any) =>
    document.objectType === 'artikel' &&
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

  private static extractHostname(url) {
    var hostname
    //find & remove protocol (http, ftp, etc.) and get hostname

    if (url.indexOf("//") > -1) {
      hostname = url.split('/')[2]
    }
    else {
      hostname = url.split('/')[0]
    }

    //find & remove port number
    hostname = hostname.split(':')[0]
    //find & remove "?"
    hostname = hostname.split('?')[0]

    return hostname
  }

  static resolveCompany = (request: FastifyRequest) => {
    let ref = request.headers.referer
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
  static clock = (start?: number): number => {
    if (!start) return process.uptime()
    var end = process.uptime()
    return Math.round((end - start) * 1000)
  }
}