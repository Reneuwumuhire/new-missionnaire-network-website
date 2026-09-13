import {
	passagePattern,
	passageOverlap,
	phraseWords,
	passageWordPatterns,
	type PassageMode
} from '../utils/passageSearch';

/** Keep a bounded overlap; resolve page/line coordinates only after a match.
 * Never copy a whole book or repeatedly rebuild coordinate arrays while scanning. */
export function firstPassage(parts: unknown, query: string, mode: PassageMode = 'phrase') {
	const regex = passagePattern(query, mode);
	const words = passageWordPatterns(query);
	const overlap = passageOverlap(query);
	if (phraseWords(query).length <= 1)
		return {
			$ifNull: [
				{
					$arrayElemAt: [
						{
							$filter: {
								input: parts,
								as: 'part',
								limit: 1,
								cond: {
									$regexMatch: { input: { $ifNull: ['$$part.text', ''] }, regex, options: 'i' }
								}
							}
						},
						0
					]
				},
				null
			]
		};
	const match =
		mode === 'words'
			? {
					$cond: [
						{
							$and: words.map((regex) => ({
								$regexMatch: { input: '$$combined', regex, options: 'i' }
							}))
						},
						{ $regexFind: { input: '$$combined', regex: words.join('|'), options: 'i' } },
						null
					]
				}
			: { $regexFind: { input: '$$combined', regex, options: 'i' } };
	return {
		$let: {
			vars: { source: parts },
			in: {
				$let: {
					vars: {
						found: {
							$reduce: {
								input: '$$source',
								initialValue: { tail: '', length: 0, hit: null },
								in: {
									$cond: [
										{ $ne: ['$$value.hit', null] },
										'$$value',
										{
											$let: {
												vars: {
													combined: {
														$concat: ['$$value.tail', ' ', { $ifNull: ['$$this.text', ''] }]
													}
												},
												in: {
													$let: {
														vars: { match, size: { $strLenCP: '$$combined' } },
														in: {
															$cond: [
																'$$match',
																{
																	hit: {
																		text: '$$combined',
																		start: {
																			$add: [
																				{
																					$subtract: [
																						'$$value.length',
																						{ $strLenCP: '$$value.tail' }
																					]
																				},
																				'$$match.idx'
																			]
																		}
																	}
																},
																{
																	hit: null,
																	tail: {
																		$substrCP: [
																			'$$combined',
																			{ $max: [0, { $subtract: ['$$size', overlap] }] },
																			overlap
																		]
																	},
																	length: {
																		$add: [
																			'$$value.length',
																			1,
																			{ $strLenCP: { $ifNull: ['$$this.text', ''] } }
																		]
																	}
																}
															]
														}
													}
												}
											}
										}
									]
								}
							}
						}
					},
					in: {
						$cond: [
							'$$found.hit',
							{
								$let: {
									vars: {
										origin: {
											$reduce: {
												input: '$$source',
												initialValue: { end: 0, part: null },
												in: {
													$cond: [
														{ $ne: ['$$value.part', null] },
														'$$value',
														{
															$let: {
																vars: {
																	end: {
																		$add: [
																			'$$value.end',
																			1,
																			{ $strLenCP: { $ifNull: ['$$this.text', ''] } }
																		]
																	}
																},
																in: {
																	end: '$$end',
																	part: {
																		$cond: [{ $gt: ['$$end', '$$found.hit.start'] }, '$$this', null]
																	}
																}
															}
														}
													]
												}
											}
										}
									},
									in: { $mergeObjects: ['$$origin.part', { text: '$$found.hit.text' }] }
								}
							},
							null
						]
					}
				}
			}
		}
	};
}
